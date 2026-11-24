// The venn renderer (spec #429 T4) through the plugin's own seam: `.mmd` fixtures parsed, laid
// out and drawn with core's render context (`renderVennForTest`). Structure and classes, the
// colours (D415), styles, text nodes in place of `foreignObject` (D414), the debug shapes, the
// `w.outline` hook (D319) and the root; v12's `vennRenderer.spec.ts` and the renderer cases of
// `vennPalette.spec.ts`, ported. The corpus properties are `conformance/src/venn/render.spec.ts`
// and the colours against v12 in every theme `conformance/src/venn/theme.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw, OutlineRole, OutlineTag } from '@mermaid-js/core/svg';
import { formatColor, parseColor } from '@mermaid-js/core/theme';
import { fixture, fixtureSource } from '../layout/mmd.fixtures.ts';
import { venn } from '../plugin.ts';
import { renderVennForTest, type RenderVennOptions } from './harness.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

const hasClass = (e: Record<string, string>, cls: string): boolean =>
  (e.class ?? '').split(' ').includes(cls);
const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => hasClass(e, cls));

/** Each `<text>` with its class, data-id, fill and its character data. */
function texts(svg: string): { cls: string; id?: string; fill?: string; text: string }[] {
  return [...svg.matchAll(/<text\b([^>]*)>(.*?)<\/text>/g)].map((m) => {
    const attr = (k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(m[1]!)?.[1];
    return {
      cls: attr('class') ?? '',
      id: attr('data-id'),
      fill: attr('fill'),
      text: m[2]!.replace(/<[^>]+>/g, ''),
    };
  });
}

/** Each `g.venn-area` and the path inside it, by `data-venn-sets`. */
function areas(
  svg: string
): Map<string, { g: Record<string, string>; path: Record<string, string> }> {
  const out = new Map<string, { g: Record<string, string>; path: Record<string, string> }>();
  for (const m of svg.matchAll(/<g\b([^>]*class="venn-area[^"]*"[^>]*)>(<path\b[^>]*>)/g)) {
    const [g] = elements(`<g${m[1]}>`, 'g');
    const [path] = elements(m[2]!, 'path');
    out.set(g!['data-venn-sets']!, { g: g!, path: path! });
  }
  return out;
}

const render = (path: string, options?: RenderVennOptions) =>
  renderVennForTest(fixtureSource(path), options);
const literal = { config: { theme: 'default', themeVariables: {} } };
const hex = (c: string | undefined) => (c ? formatColor(parseColor(c)!) : undefined);

describe('structure (spec #429 Renderer)', () => {
  it('draws text.venn-title, then the areas and text nodes in one group moved down by the title', async () => {
    const { svg, layout } = await render('pr-check/3-should-render-a-venn-diagram-with-a-title');
    expect(svg).toMatch(/^<svg [^>]*class="mermaid mermaid-venn"[^>]*aria-roledescription="venn"/);
    // vennRenderer.spec.ts "renders a title when provided": the title is the root's first text.
    const title = texts(svg)[0]!;
    expect(title).toMatchObject({ cls: 'venn-title', id: 'title', text: 'Skills Overlap' });
    expect(svg).toContain('<title id="mermaid-0-title">Skills Overlap</title>');
    expect(svg).toMatch(/aria-labelledby="mermaid-0-title"/);
    expect(layout.titleHeight).toBeGreaterThan(0);
    expect(svg).toContain(`<g transform="translate(0,${layout.titleHeight})">`);
    expect([...areas(svg).values()].map((a) => a.g.class)).toEqual([
      'venn-area venn-circle venn-set-0',
      'venn-area venn-circle venn-set-1',
      'venn-area venn-circle venn-set-2',
      'venn-area venn-intersection',
      'venn-area venn-intersection',
      'venn-area venn-intersection',
      'venn-area venn-intersection',
    ]);
    expect([...areas(svg).keys()]).toEqual([
      'Frontend',
      'Backend',
      'DevOps',
      'Backend_Frontend',
      'Backend_DevOps',
      'DevOps_Frontend',
      'Backend_DevOps_Frontend',
    ]);
  });

  it('puts data-ast on each area and text node only, data-id on labels, no ids but the title’s', async () => {
    const { svg, model } = await render('pr-check/6-should-render-a-venn-diagram-with-text-nodes');
    const marked = elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined);
    expect(marked.map((e) => e['data-ast']).sort()).toEqual(
      [...model.subsets.map((s) => s.ast), ...model.textNodes.map((t) => t.ast)].sort()
    );
    for (const e of marked)
      expect(hasClass(e, 'venn-area') || hasClass(e, 'venn-text-node')).toBe(true);
    for (const e of [...byClass(svg, 'text', 'label'), ...byClass(svg, 'text', 'venn-title')]) {
      expect(e['data-id']).toBeDefined();
      expect(e['data-ast']).toBeUndefined();
    }
    expect(svg).not.toMatch(/\sid="|foreignObject|<style|undefined|NaN/);
  });

  it('draws text nodes as g.venn-text-nodes > g.venn-text-area > text.venn-text-node (D414)', async () => {
    const { svg, layout } = await render('pr-check/6-should-render-a-venn-diagram-with-text-nodes');
    expect(svg).toMatch(/<g class="venn-text-nodes"><g class="venn-text-area" font-size="20">/);
    const nodes = texts(svg).filter((t) => t.cls === 'venn-text-node');
    expect(nodes.map((n) => n.id)).toEqual(
      layout.textAreas.flatMap((t) => t.nodes.map((n) => n.id))
    );
    expect(svg.indexOf('venn-text-nodes')).toBeGreaterThan(svg.lastIndexOf('venn-area'));
  });

  it('draws nothing for an overlap the solver could not place (venn.js disjoint)', async () => {
    const { svg, layout } = await render('nightly-check/layout/disjoint-overlap');
    const off = layout.areas.filter((a) => !a.path);
    expect(off.length).toBeGreaterThan(0);
    for (const a of off) expect(areas(svg).has(a.sets.join('_'))).toBe(false);
  });

  it('sizes the root to the layout bounds, and to its width with useMaxWidth off', async () => {
    const { svg, layout } = await render('pr-check/1-should-render-a-simple-two-set-venn-diagram');
    const b = layout.bounds;
    expect(svg).toContain(`viewBox="${b.x} ${b.y} ${Math.ceil(b.width)} ${Math.ceil(b.height)}"`);
    expect(svg).toMatch(/width="100%"/);
    const fixed = await renderVennForTest(
      fixtureSource('pr-check/1-should-render-a-simple-two-set-venn-diagram'),
      {
        config: { venn: { useMaxWidth: false } },
      }
    );
    expect(fixed.svg).toMatch(/width="800" height="450"/);
  });
});

describe('colours (spec #429 Renderer, D415)', () => {
  // vennRenderer.spec.ts "applies theme colors to circles".
  it('gives the circles venn-set-<i mod 8> and slot colours venn1, venn2, …', async () => {
    const { svg } = await render('pr-check/1-should-render-a-simple-two-set-venn-diagram', literal);
    const [a, b] = [...areas(svg).values()];
    expect([a!.g.class, b!.g.class]).toEqual([
      'venn-area venn-circle venn-set-0',
      'venn-area venn-circle venn-set-1',
    ]);
    expect(a!.path).toMatchObject({
      fill: 'var(--_vn1)',
      stroke: 'var(--_vn1)',
      'fill-opacity': '0.1',
      'stroke-opacity': '0.95',
    });
    expect(b!.path.fill).toBe('var(--_vn2)');
    expect(svg).toMatch(/--_vn1:var\(--mermaid-venn1,/);
  });

  // vennRenderer.spec.ts "user override colors take priority over theme via style data".
  it('fills a styled overlap at opacity 1 and colours its label; an unstyled one is transparent', async () => {
    const { svg } = await render('nightly-check/stroke-styles', literal);
    const ab = areas(svg).get('A_B')!;
    expect(ab.path).toMatchObject({ fill: '#ffbf00', 'fill-opacity': '1' });
    expect(texts(svg).find((t) => t.text === 'Both')!.fill).toBe('#333333');
    const plain = await render('pr-check/1-should-render-a-simple-two-set-venn-diagram', literal);
    expect(areas(plain.svg).get('A_B')!.path).toMatchObject({
      fill: 'transparent',
      'fill-opacity': '0',
    });
  });

  it('takes a circle’s fill, stroke, stroke-width and fill-opacity from its style', async () => {
    const { svg } = await render('nightly-check/stroke-styles', literal);
    expect(areas(svg).get('A')!.path).toMatchObject({
      stroke: '#d62728',
      'stroke-width': '2',
      'fill-opacity': '0.3',
    });
    expect(areas(svg).get('B')!.path).toMatchObject({
      stroke: '#1f77b4',
      'stroke-width': '8',
      'fill-opacity': '0.05',
    });
    const filled = await render(
      'pr-check/7-should-render-a-venn-diagram-with-custom-colors-via-style',
      literal
    );
    expect(areas(filled.svg).get('A')!.path).toMatchObject({ fill: '#ff6b6b', stroke: '#ff6b6b' });
    // v12 darkens the base by 30 for the label on a light background (khroma's
    // darken('#ff6b6b', 30) is hsl(0, 100%, 40.98%)).
    expect(texts(filled.svg).find((t) => t.text === 'A')!.fill).toBe('#d10000');
  });

  // vennRenderer.spec.ts "renders text nodes with custom color via style data".
  it('colours a text node by its own style, else vennSetTextColor', async () => {
    const { svg } = await render(
      'pr-check/11-should-render-a-venn-diagram-with-custom-text-colors-via-style'
    );
    const nodes = texts(svg).filter((t) => t.cls === 'venn-text-node');
    expect(nodes.map((n) => [n.text, n.fill])).toEqual([
      ['Red Text', '#ff0000'],
      ['Blue Text', '#0000ff'],
      ['Green Text', '#00ff00'],
    ]);
    const plain = await render('pr-check/6-should-render-a-venn-diagram-with-text-nodes');
    for (const n of texts(plain.svg).filter((t) => t.cls === 'venn-text-node'))
      expect(n.fill).toBe('var(--_vns)');
  });

  // vennRenderer.spec.ts "computes contrasting text color for dark backgrounds": khroma's
  // lighten by 30 of the slot colour where `background` is dark.
  it('lightens set labels on a dark background and darkens them on a light one', async () => {
    const dark = await render('nightly-check/9-should-render-with-dark-theme', {
      config: { themeVariables: {} },
    });
    const light = await render('pr-check/3-should-render-a-venn-diagram-with-a-title', literal);
    const label = (svg: string, id: string) =>
      byClass(svg, 'text', 'label').find((t) => t['data-id'] === id)!.fill;
    const fill = (svg: string, id: string) => areas(svg).get(id)!.path.fill;
    expect(label(dark.svg, 'A')).not.toBe(fill(dark.svg, 'A'));
    // khroma's lighten('#1a1a2e', 30) is hsl(240, 27.78%, 44.12%); darken of default's venn1
    // (hsl(240, 100%, 66.27%)) is hsl(240, 100%, 36.27%).
    const darkLiteral = await render('nightly-check/9-should-render-with-dark-theme', {
      config: { themeVariables: { venn1: '#1a1a2e' } },
    });
    expect(label(darkLiteral.svg, 'A')).toBe('#515190');
    expect(label(light.svg, 'Frontend')).toBe('#0000b9');
  });

  // vennPalette.spec.ts "paints each circle its own colour under a palette theme".
  it('paints each circle its own palette colour under redux-color', async () => {
    const { svg } = await render('nightly-check/three-sets-redux-color-theme');
    const fills = [...areas(svg).values()]
      .filter((a) => hasClass(a.g, 'venn-circle'))
      .map((a) => a.path.fill);
    expect(fills.length).toBeGreaterThanOrEqual(2);
    expect(new Set(fills).size).toBe(fills.length);
    expect(fills.every((f) => f?.startsWith('#'))).toBe(true);
  });

  // vennPalette.spec.ts "falls back to one colour, not to undefined, without a palette".
  it('falls back to one flat colour, primaryColor, without a palette', async () => {
    const { svg } = await renderVennForTest(
      fixtureSource('pr-check/2-should-render-a-three-set-venn-diagram'),
      { config: { theme: 'redux', themeVariables: {} } }
    );
    const circles = [...areas(svg).values()].filter((a) => hasClass(a.g, 'venn-circle'));
    expect(circles.map((c) => c.path.fill)).toEqual(['var(--_p)', 'var(--_p)', 'var(--_p)']);
    // redux writes no slot, so no slot alias is declared (v12's `.filter(Boolean)`).
    expect(svg).not.toMatch(/--_vn\d/);
    expect(svg).not.toContain('undefined');
  });

  it('cycles the slots an author writes in a theme that has none, as v12', async () => {
    const { svg } = await renderVennForTest(
      fixtureSource('pr-check/2-should-render-a-three-set-venn-diagram'),
      { config: { theme: 'neo', themeVariables: { venn1: '#aa0000', venn3: '#0000aa' } } }
    );
    const circles = [...areas(svg).values()].filter((a) => hasClass(a.g, 'venn-circle'));
    expect(circles.map((c) => c.path.fill)).toEqual(['var(--_vn1)', 'var(--_vn3)', 'var(--_vn1)']);
  });

  it('keeps the palette colour of a slot whose author colour is dropped or empty', async () => {
    const circles = async (themeVariables: Record<string, string>) => {
      const { svg } = await renderVennForTest(
        fixtureSource('pr-check/2-should-render-a-three-set-venn-diagram'),
        { config: { theme: 'redux-color', themeVariables } }
      );
      const found = [...areas(svg).values()].filter((a) => hasClass(a.g, 'venn-circle'));
      return found.map((c) => c.path.fill);
    };
    const plain = await circles({});
    for (const venn1 of ['redd', 'url(x)', '']) expect(await circles({ venn1 })).toEqual(plain);
    expect(await circles({ venn1: '#aa0000' })).toEqual(['var(--_vn1)', plain[1], plain[2]]);
  });

  it('keeps an explicit style fill over the palette', async () => {
    const { svg } = await render('nightly-check/explicit-set-style-over-redux-palette');
    expect(areas(svg).get('A')!.path.fill).toBe('#00ff00');
    expect(areas(svg).get('B')!.path.fill).toMatch(/^#/);
    expect(hex(areas(svg).get('B')!.path.fill)).not.toBe('#00ff00');
  });
});

describe('useDebugLayout (v12 renderTextNodes)', () => {
  // vennRenderer.spec.ts "renders debug layout helpers when enabled".
  it('draws each text area’s inner circle and each cell, dashed', async () => {
    const { svg, layout } = await render('nightly-check/debug-layout');
    const circles = byClass(svg, 'circle', 'venn-text-debug-circle');
    const cells = byClass(svg, 'rect', 'venn-text-debug-cell');
    expect(circles).toHaveLength(layout.textAreas.length);
    expect(cells).toHaveLength(layout.textAreas.flatMap((t) => t.nodes).length);
    expect(circles[0]).toMatchObject({ fill: 'none', stroke: 'purple', 'stroke-dasharray': '3 2' });
    expect(cells[0]).toMatchObject({ fill: 'none', stroke: 'teal', 'stroke-dasharray': '2 1.5' });
    const plain = await render('pr-check/6-should-render-a-venn-diagram-with-text-nodes');
    expect(plain.svg).not.toContain('venn-text-debug');
  });
});

describe('hand-drawn (D319)', () => {
  const recording = () => {
    const calls: { role: OutlineRole; tag: OutlineTag; attrs: Attrs }[] = [];
    const draw: OutlineDraw = (role, tag, attrs) => {
      calls.push({ role, tag, attrs });
      return false;
    };
    return { calls, draw };
  };

  it.each([
    'pr-check/15-should-render-a-three-set-venn-with-handdrawn-look-and-title',
    'nightly-check/handdrawn/14-should-render-a-two-set-venn-diagram-with-handdrawn-look',
    'nightly-check/handdrawn/18-should-render-a-handdrawn-venn-with-custom-styles-and-text-nodes',
  ])(
    '%s: each circle and each styled overlap goes through w.outline; a declining drawer changes nothing',
    async (path) => {
      const { calls, draw } = recording();
      const sketched = await render(path, { outline: draw });
      const plain = await render(path);
      expect(sketched.svg).toBe(plain.svg);
      const sets = sketched.layout.areas.filter((a) => a.kind === 'set');
      const styled = sketched.model.styles.filter(
        (s) => s.targets.length > 1 && 'fill' in s.properties
      );
      expect(calls.map((c) => `${c.role} ${c.tag}`)).toEqual(
        Array.from({ length: sets.length + styled.length }, () => 'node path')
      );
    }
  );

  it('writes a drawer’s replacement where the circle was', async () => {
    const draw: OutlineDraw = (_role, _tag, attrs, sink) => {
      sink.open('g', { class: 'sketch' });
      sink.leaf('path', { d: attrs.d, fill: attrs.fill });
      sink.close();
      return true;
    };
    const { svg } = await render(
      'nightly-check/handdrawn/18-should-render-a-handdrawn-venn-with-custom-styles-and-text-nodes',
      { outline: draw }
    );
    expect(svg.match(/<g class="sketch">/g)).toHaveLength(3);
    expect(svg).toMatch(/<g class="venn-area venn-circle venn-set-0"[^>]*><g class="sketch">/);
  });
});

describe('the plugin (DESIGN §12.1)', () => {
  it('is SVG only, lays itself out and carries its theme table (D320, D331)', () => {
    expect(venn).toMatchObject({ id: 'venn', formats: ['svg'], layoutKind: 'custom' });
    expect('ascii' in venn).toBe(false);
    expect(Object.keys(venn.theme.vars)).toEqual([
      ...Array.from({ length: 8 }, (_, i) => `venn${i + 1}`),
      'vennTitleTextColor',
      'vennSetTextColor',
    ]);
    expect(venn.theme.section).toBeUndefined();
  });

  it('lists every text the layout measures: the title, labels or set ids, text labels or ids', () => {
    const { model } = fixture(
      'nightly-check/13-should-render-a-complex-venn-with-labels-text-nodes-and-styles'
    );
    const labels = venn.labels(model);
    if (model.title !== undefined) expect(labels).toContain(model.title);
    for (const s of model.subsets)
      if (s.label !== undefined || s.sets.length === 1)
        expect(labels).toContain(s.label ?? s.sets[0]);
    for (const t of model.textNodes) expect(labels).toContain(t.label ?? t.id);
    expect(labels.length).toBeGreaterThan(5);
  });
});
