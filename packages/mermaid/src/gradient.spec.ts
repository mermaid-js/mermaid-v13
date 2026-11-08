import { describe, expect, it } from 'vitest';
import type { RenderContext } from '@mermaid-js/core';
import {
  assertInert,
  styleText,
  type GradientRef,
  type SafeColor,
  type SafeValue,
  type SvgTree,
  type SvgWriter,
} from '@mermaid-js/core/svg';
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

/** A diagram whose links are user-space gradients (D391) blended with multiply (D392), as sankey's. */
const LINKED = {
  manifest: { plugin: 'diagram', id: 'linked', entry: './dist/index.js', export: 'linked' },
  detector: (text: string) => text.trimStart().startsWith('linked'),
  load: async () => ({
    linked: {
      id: 'linked',
      layoutKind: 'custom' as const,
      detector: () => true,
      parse: (text: string) => ({
        model: text,
        ast: { id: 'l', type: 'Linked', range: { start: 0, end: text.length } },
        diagnostics: [],
        symbols: [],
        statements: [],
      }),
      render: (_m: string, _l: unknown, ctx: RenderContext, w: SvgWriter) => {
        const [a, b] = ['#1f77b4', '#ff7f0e'] as SafeColor[];
        w.open('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: [0, 0, 40, 10] });
        w.leaf('rect', {
          x: 0,
          y: 0,
          width: 4,
          height: 4,
          stroke: ctx.theme.outline('nodeBorder'),
        });
        const style = styleText({ 'mix-blend-mode': 'multiply' as SafeValue });
        for (const [x1, x2] of [
          [4, 36],
          [4, 36],
          [4, 20],
        ] as const)
          w.leaf('path', {
            d: w.path().moveTo(x1, 2).lineTo(x2, 2).done(),
            stroke: w.linearGradient({ x1, x2, from: a!, to: b! }),
            style,
          });
        w.close();
      },
    },
  }),
} as ExternalDiagram;

describe('user-space gradients and blend mode through render (D391, D392)', () => {
  const mermaid = async (...more: ExternalDiagram[]) => {
    const m = createMermaid();
    await m.registerExternalDiagrams([LINKED, ...more]);
    return m;
  };

  it('writes one gradient per distinct link, scoped to the render', async () => {
    const { svg } = await (await mermaid()).render('d1', 'linked');
    expect(svg.match(/<linearGradient /g)).toHaveLength(2);
    expect(svg).toMatch(
      /^<svg[^>]*><defs><linearGradient id="d1-g-[0-9a-z]+" gradientUnits="userSpaceOnUse" x1="4" y1="0" x2="36" y2="0">/
    );
    expect(svg.match(/style="mix-blend-mode:multiply"/g)).toHaveLength(3);
    assertInert(svg, { gradient: false, scope: 'd1' });
  });

  it('puts them after the render’s gradient (D182) when that is on', async () => {
    const { svg } = await (await mermaid()).render('d1', 'linked', { config: ON });
    expect(svg).toContain('</linearGradient><linearGradient id="d1-g-');
    assertInert(svg, { gradient: 'd1-gradient', scope: 'd1' });
  });

  it('gives two renders with different id prefixes no id in common', async () => {
    const m = await mermaid();
    const a = ids((await m.render('a', 'linked', { config: ON })).svg);
    const b = ids((await m.render('b', 'linked', { config: ON })).svg);
    expect(a).toHaveLength(3);
    expect(b.filter((id) => a.includes(id))).toEqual([]);
    const c = ids(m.renderSync('linked').svg);
    const d = ids(m.renderSync('linked\n').svg);
    expect(c.filter((id) => d.includes(id))).toEqual([]);
  });

  it('writes the same bytes through the tree a postRender hook edits', async () => {
    const plain = (await (await mermaid()).render('d1', 'linked', { config: ON })).svg;
    const m = await mermaid({ id: 'noop', postRender: () => undefined });
    expect((await m.render('d1', 'linked', { config: ON })).svg).toBe(plain);
  });

  it('fails the render when a hook plants a gradient into a type that draws none', async () => {
    const plant = (t: SvgTree) => {
      const g = t.append(t.root, 'linearGradient' as 'g', { id: 'd2-g-abc' });
      t.setAttr(t.find({ tag: 'rect' })[0]!, 'stroke', 'url(#d2-g-abc)' as GradientRef);
      return g;
    };
    for (const edit of [plant, (t: SvgTree) => void t.append(t.root, 'defs' as 'g')]) {
      const m = await mermaidWith({ id: 'hostile', postRender: edit });
      const e = await m.render('d1', 'outlined').catch((x: unknown) => x);
      expect(e).toBeInstanceOf(MermaidError);
      expect((e as MermaidError).code).toBe('INTERNAL');
    }
  });

  it.each([
    ['refers to an undeclared gradient', 'url(#d1-g-zzz)'],
    ['refers to another render’s gradient', 'url(#d2-g-zzz)'],
  ])('fails the render when a hook %s', async (_what, paint) => {
    const edit = (t: SvgTree) =>
      t.setAttr(t.find({ tag: 'path' })[0]!, 'stroke', paint as GradientRef);
    const m = await mermaid({ id: 'hostile', postRender: edit });
    const e = await m.render('d1', 'linked').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(MermaidError);
    expect((e as MermaidError).code).toBe('INTERNAL');
  });
});
