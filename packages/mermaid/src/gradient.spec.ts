import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@mermaid-js/core';
import { assertInert, type GradientRef, type SvgTree, type SvgWriter } from '@mermaid-js/core/svg';
import { createMermaid, MermaidError, type ExternalDiagram } from './index.ts';

/** A diagram whose renderer outlines its one box with `theme.outline()`, as T3–T7 will. */
const OUTLINED = {
  manifest: { plugin: 'diagram', id: 'outlined', entry: './dist/index.js', export: 'outlined' },
  detector: (text: string) => text.trimStart().startsWith('outlined'),
  load: async () => ({
    outlined: {
      id: 'outlined',
      layoutKind: 'custom' as const,
      detector: () => true,
      parse: (text: string) => ({
        model: text,
        ast: { id: 'o', type: 'Outlined', range: { start: 0, end: text.length } },
        diagnostics: [],
        symbols: [],
        statements: [],
      }),
      render: (_m: string, _l: unknown, ctx: RenderContext, w: SvgWriter) => {
        const stroke = ctx.theme.outline('nodeBorder');
        w.open('svg', {
          xmlns: 'http://www.w3.org/2000/svg',
          viewBox: [0, 0, 20, 10],
          style: ctx.theme.rootStyleText(),
        });
        w.open('title', { id: `${ctx.idPrefix}-title` });
        w.text('box');
        w.close();
        w.leaf('rect', { x: 1, y: 1, width: 18, height: 8, fill: 'none', stroke });
        w.close();
      },
    },
  }),
} as ExternalDiagram;

const ON = { theme: 'redux-color', themeVariables: { useGradient: true } } as const;

async function mermaidWith(...more: ExternalDiagram[]) {
  const m = createMermaid();
  await m.registerExternalDiagrams([OUTLINED, ...more]);
  return m;
}

const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]*)"/g)].map((x) => x[1]);

describe('the neo gradient through render (D182)', () => {
  it('paints the outline with the render’s one gradient', async () => {
    const m = await mermaidWith();
    const { svg } = await m.render('d1', 'outlined', { config: ON });
    expect(svg.match(/<linearGradient /g)).toHaveLength(1);
    expect(svg).toContain(
      '<defs><linearGradient id="d1-gradient" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="var(--mermaid-gradientStart,#0042eb)"/>' +
        '<stop offset="1" stop-color="var(--mermaid-gradientStop,#eb0042)"/></linearGradient></defs>'
    );
    expect(svg).toContain('stroke="url(#d1-gradient)"');
    assertInert(svg);
  });

  it('is the outline colour, with no defs, while useGradient is off', async () => {
    const m = await mermaidWith();
    const { svg } = await m.render('d1', 'outlined');
    expect(svg).not.toContain('defs');
    expect(svg).toContain('stroke="var(--_nb)"');
  });

  it('writes literal stops with cssVariables: false', async () => {
    const m = await mermaidWith();
    m.initialize({ output: { cssVariables: false } });
    const { svg } = await m.render('d1', 'outlined', { config: ON });
    expect(svg).toContain('<stop offset="0" stop-color="#0042eb"/>');
    expect(svg).toContain('<stop offset="1" stop-color="#eb0042"/>');
  });

  it('gives two renders with different id prefixes no id in common', async () => {
    const m = await mermaidWith();
    const a = ids((await m.render('a', 'outlined', { config: ON })).svg);
    const b = ids((await m.render('b', 'outlined', { config: ON })).svg);
    expect(a).toEqual(['a-gradient', 'a-title']);
    expect(b.filter((id) => a.includes(id))).toEqual([]);
    // The default prefix hashes the text, so different diagrams differ too.
    const c = ids(m.renderSync('outlined', { config: ON }).svg);
    const d = ids(m.renderSync('outlined\n', { config: ON }).svg);
    expect(c.filter((id) => d.includes(id))).toEqual([]);
  });

  it('is deterministic (R-TEXT-7)', async () => {
    const m = await mermaidWith();
    const first = (await m.render('d1', 'outlined', { config: ON })).svg;
    expect((await m.render('d1', 'outlined', { config: ON })).svg).toBe(first);
    expect((await (await mermaidWith()).render('d1', 'outlined', { config: ON })).svg).toBe(first);
  });

  it('writes the same bytes through the tree a postRender hook edits', async () => {
    const plain = (await (await mermaidWith()).render('d1', 'outlined', { config: ON })).svg;
    const m = await mermaidWith({ id: 'noop', postRender: () => undefined });
    expect((await m.render('d1', 'outlined', { config: ON })).svg).toBe(plain);
  });

  const hostile: [string, (tree: SvgTree) => void][] = [
    [
      'points an outline at another gradient',
      (t) =>
        t.setAttr(t.find({ tag: 'rect' })[0]!, 'stroke', 'url(#other-gradient)' as GradientRef),
    ],
    [
      'refers to the gradient from a render without one',
      (t) => t.setAttr(t.find({ tag: 'rect' })[0]!, 'fill', 'url(#d1-gradient)' as GradientRef),
    ],
    ['adds a second gradient', (t) => void t.append(t.root, 'defs' as 'g')],
  ];
  for (const [what, edit] of hostile) {
    it(`fails the render when a hook ${what}`, async () => {
      const m = await mermaidWith({ id: 'hostile', postRender: edit });
      const config = what.includes('without') ? {} : ON;
      const e = await m.render('d1', 'outlined', { config }).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code).toBe('INTERNAL');
    });
  }
});
