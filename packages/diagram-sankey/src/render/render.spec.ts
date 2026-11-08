// The sankey renderer (spec #427 T4) through the plugin's own seam: parsed sources laid out and
// drawn with core's render context (`renderSankeyForTest`). Structure (`g.nodes`,
// `g.node-labels`, `g.links`), node fills, both label styles, every `linkColor` mode with its
// user-space gradients (D391) and blend (D392), `data-ast`/`data-id` (D397), ids, the title
// fallback (D396) and the root. Expected numbers are v12 12.2.0's, read from its SVG in
// Chromium (rounded to two decimals, as v13 writes numbers). The corpus properties are
// `conformance/src/sankey/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import { assertInert, styleScope } from '@mermaid-js/core/svg';
import { renderSankeyForTest } from './harness.ts';
import { fixture, sankeyCase } from './sources.fixtures.ts';

/** Every `<tag>` start tag's attributes, in document order. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<(?:${tag})\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = unescape(a[2]!);
    out.push(attrs);
  }
  return out;
}

const unescape = (v: string): string =>
  v.replace(
    /&(lt|gt|quot|amp);/g,
    (_, e: string) => ({ lt: '<', gt: '>', quot: '"', amp: '&' })[e]!
  );

const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => (e.class ?? '').split(' ').includes(cls));

/** The texts of every `<text>`, in document order. */
const texts = (svg: string): string[] =>
  [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);

/**
 * `a,b,10` and `b,c,10` with `sankey: {}` in its front matter, so the integrator's `sankey`
 * options below apply. v12 12.2.0 draws it as `a` (0–10), `b` (295–305) and `c` (590–600), each
 * 400 high, on a 600 × 400 extent.
 */
const CHAIN = fixture('nightly-check/legacy-label-style-by-default');
/** The chain with the integrator's `sankey` options (and theme). */
const chain = (sankey: Record<string, unknown>, theme?: string) =>
  renderSankeyForTest(CHAIN, { config: { sankey, ...(theme ? { theme } : {}) } });

describe('structure (spec #427 Renderer)', () => {
  it('draws g.nodes > g.node > rect, then g.node-labels, then g.links > g.link > path, in v12 order', async () => {
    const { svg } = await renderSankeyForTest(CHAIN);
    const order = ['class="nodes"', 'class="node-labels"', 'class="links"'].map((s) =>
      svg.indexOf(s)
    );
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const nodes = byClass(svg, 'g', 'node');
    expect(nodes.map((n) => n.transform)).toEqual([
      'translate(0,0)',
      'translate(295,0)',
      'translate(590,0)',
    ]);
    expect(elements(svg, 'rect').map((r) => [r.width, r.height, r.fill])).toEqual([
      ['10', '400', '#4e79a7'],
      ['10', '400', '#f28e2c'],
      ['10', '400', '#e15759'],
    ]);
    const paths = elements(svg, 'path');
    expect(paths.map((p) => p.d)).toEqual([
      'M10,200C152.5,200 152.5,200 295,200',
      'M305,200C447.5,200 447.5,200 590,200',
    ]);
    expect(paths.map((p) => p['stroke-width'])).toEqual(['400', '400']);
    expect(byClass(svg, 'g', 'links')[0]).toMatchObject({ fill: 'none', 'stroke-opacity': '0.5' });
  });

  it('puts data-ast on each g.node and g.link, data-id on labels only (D397)', async () => {
    const { svg } = await renderSankeyForTest(CHAIN);
    const withAst = elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined);
    expect(withAst.map((e) => [e.class, e['data-ast']])).toEqual([
      ['node', 'node:a'],
      ['node', 'node:b'],
      ['node', 'node:c'],
      ['link', 'link:a->b'],
      ['link', 'link:b->c'],
    ]);
    expect(withAst.every((e) => e['data-id'] === e['data-ast'])).toBe(true);
    expect(elements(svg, 'text').map((t) => t['data-id'])).toEqual(['node:a', 'node:b', 'node:c']);
  });

  it('writes the root as v12 sized it: the bounds, with a max width unless useMaxWidth is false', async () => {
    // v12 12.2.0's resolved `sankey.useMaxWidth` is `true` (its schema documents `false`).
    const { svg, layout } = await renderSankeyForTest(CHAIN);
    const root = elements(svg, 'svg')[0]!;
    const b = layout.bounds;
    const w = Math.ceil(b.width);
    const h = Math.ceil(b.height);
    expect(root.viewBox).toBe(`${b.x} ${b.y} ${w} ${h}`);
    expect(root.width).toBe('100%');
    expect(root.height).toBeUndefined();
    expect(root.style).toContain(`max-width:${w}px`);
    expect(root['aria-roledescription']).toBe('sankey');
    expect(root.role).toBe('img');
    expect(root.class).toBe('mermaid mermaid-sankey');
    const fixed = elements((await chain({ useMaxWidth: false })).svg, 'svg')[0]!;
    expect([fixed.width, fixed.height]).toEqual([String(w), String(h)]);
    expect(fixed.style ?? '').not.toContain('max-width');
  });
});

describe('labels (D395, both label styles)', () => {
  it('legacy: one text per node in textColor at 14 px, v12 anchors, the value on the same line', async () => {
    const { svg } = await chain({}, 'default');
    const group = byClass(svg, 'g', 'node-labels')[0]!;
    expect(group['font-size']).toBe('14');
    expect(group.fill).toMatch(/^var\(--_[\w-]+\)$/);
    const labels = elements(svg, 'text');
    expect(labels.map((t) => [t.x, t.y, t.dy, t['text-anchor'], t.class])).toEqual([
      ['16', '200', '0', 'start', undefined],
      ['311', '200', '0', 'start', undefined],
      ['584', '200', '0', 'end', undefined],
    ]);
    expect(texts(svg)).toEqual(['a 10', 'b 10', 'c 10']);
  });

  it('legacy without values: the name only, shifted by 0.35 em (4.9 px)', async () => {
    const { svg } = await chain({ showValues: false });
    expect(texts(svg)).toEqual(['a', 'b', 'c']);
    expect(elements(svg, 'text').map((t) => t.dy)).toEqual(['4.9', '4.9', '4.9']);
  });

  it('outlined: every mainBkg-stroked sankey-label-bg, then every sankey-label-fg', async () => {
    const { svg } = await chain({ labelStyle: 'outlined' });
    const bg = byClass(svg, 'text', 'sankey-label-bg');
    const fg = byClass(svg, 'text', 'sankey-label-fg');
    expect(bg).toHaveLength(3);
    for (const t of bg) {
      expect(t.stroke).toMatch(/^var\(--_[\w-]+\)$/);
      expect(t).toMatchObject({ 'stroke-width': '4', 'stroke-linejoin': 'round' });
    }
    expect(fg).toHaveLength(3);
    for (const t of fg) expect(t.stroke).toBeUndefined();
    expect(bg[0]!.stroke).not.toBe(byClass(svg, 'g', 'node-labels')[0]!.fill);
    // v12's two passes: the backgrounds, then the foregrounds.
    expect(elements(svg, 'text').map((t) => t.class)).toEqual([
      ...Array<string>(3).fill('sankey-label-bg'),
      ...Array<string>(3).fill('sankey-label-fg'),
    ]);
    expect(texts(svg)).toEqual(['a 10', 'b 10', 'c 10', 'a 10', 'b 10', 'c 10']);
  });
});

describe('links (linkColor, D391, D392)', () => {
  const scope = styleScope('mermaid-0');

  it('gradient (the default): one user-space gradient per link, from the source at x1 to the target at x0', async () => {
    const { svg } = await renderSankeyForTest(CHAIN);
    const grads = elements(svg, 'linearGradient');
    expect(grads.map((g) => [g.gradientUnits, g.x1, g.x2, g.y1, g.y2])).toEqual([
      ['userSpaceOnUse', '10', '295', '0', '0'],
      ['userSpaceOnUse', '305', '590', '0', '0'],
    ]);
    expect(elements(svg, 'stop').map((s) => s['stop-color'])).toEqual([
      '#4e79a7',
      '#f28e2c',
      '#f28e2c',
      '#e15759',
    ]);
    expect(elements(svg, 'path').map((p) => p.stroke)).toEqual(grads.map((g) => `url(#${g.id})`));
    expect(grads.every((g) => g.id!.startsWith(`${scope}-g-`))).toBe(true);
    expect(() => assertInert(svg, { gradient: false, scope })).not.toThrow();
  });

  it('shares one gradient between links with the same ends and colours', async () => {
    const { svg } = await renderSankeyForTest(sankeyCase('sankey-cases/links-repeated'));
    expect(elements(svg, 'linearGradient')).toHaveLength(1);
    expect(new Set(elements(svg, 'path').map((p) => p.stroke)).size).toBe(1);
  });

  it('source, target and a CSS colour stroke the path with no gradient', async () => {
    const strokes = async (linkColor: string) => {
      const { svg } = await chain({ linkColor });
      expect(svg).not.toContain('<linearGradient');
      return elements(svg, 'path').map((p) => p.stroke);
    };
    expect(await strokes('source')).toEqual(['#4e79a7', '#f28e2c']);
    expect(await strokes('target')).toEqual(['#f28e2c', '#e15759']);
    expect(await strokes('#636465')).toEqual(['#636465', '#636465']);
  });

  it('draws a linkColor that is no colour as the default gradient (T5 warns)', async () => {
    for (const linkColor of ['url(javascript:x)', 'red;x:y', 42]) {
      const { svg } = await chain({ linkColor });
      expect(elements(svg, 'linearGradient'), String(linkColor)).toHaveLength(2);
      expect(svg).not.toMatch(/javascript|x:y|42/);
    }
  });

  it('blends every g.link with multiply (D392)', async () => {
    const { svg } = await renderSankeyForTest(CHAIN);
    expect(byClass(svg, 'g', 'link').map((g) => g.style)).toEqual([
      'mix-blend-mode:multiply',
      'mix-blend-mode:multiply',
    ]);
  });
});

describe('node colours', () => {
  it('fills nodeColors entries and gives the rest the Tableau10 slots in order', async () => {
    const { svg } = await chain({ nodeColors: { b: '#123456' }, linkColor: 'source' });
    expect(elements(svg, 'rect').map((r) => r.fill)).toEqual(['#4e79a7', '#123456', '#f28e2c']);
    expect(elements(svg, 'path').map((p) => p.stroke)).toEqual(['#4e79a7', '#123456']);
  });

  it('drops a nodeColors entry that is no colour: the node takes its slot, its links its colour', async () => {
    // Spec #427 §Integration: dropped, and the default used (#503 warns). v12 drew it black.
    const nodeColors = { a: 5, b: 'red;x:url(y)' };
    const source = await chain({ nodeColors, linkColor: 'source' });
    expect(source.svg).not.toContain('url(y)');
    expect(elements(source.svg, 'rect').map((r) => r.fill)).toEqual([
      '#4e79a7',
      '#f28e2c',
      '#e15759',
    ]);
    expect(elements(source.svg, 'path').map((p) => p.stroke)).toEqual(['#4e79a7', '#f28e2c']);
    const gradient = await chain({ nodeColors });
    expect(elements(gradient.svg, 'stop').map((s) => s['stop-color'])).toEqual([
      '#4e79a7',
      '#f28e2c',
      '#f28e2c',
      '#e15759',
    ]);
    for (const { svg } of [source, gradient])
      expect(() => assertInert(svg, { gradient: false, scope: 'mermaid-0' })).not.toThrow();
  });
});

describe('ids, title and determinism', () => {
  it('writes no element id but the gradients without a title', async () => {
    const { svg } = await renderSankeyForTest(CHAIN);
    const ids = elements(svg, '[a-zA-Z]+').flatMap((e) => (e.id === undefined ? [] : [e.id]));
    expect(ids.length).toBe(2);
    expect(ids.every((id) => id.startsWith('mermaid-0-g-'))).toBe(true);
    expect(svg).not.toMatch(/<title|aria-labelledby|<desc/);
  });

  it('names the diagram by its front-matter title (D396), drawing none', async () => {
    const { svg } = await renderSankeyForTest(sankeyCase('sankey-cases/front-matter-title'), {
      idPrefix: 'd7',
    });
    expect(elements(svg, 'svg')[0]!['aria-labelledby']).toBe('d7-title');
    expect(svg).toContain('<title id="d7-title">T</title>');
    expect(texts(svg)).not.toContain('T');
  });

  it('gives the same bytes on both writer backings and on a second render', async () => {
    const config = { sankey: { labelStyle: 'outlined' } };
    const a = (await renderSankeyForTest(CHAIN, { config })).svg;
    expect((await renderSankeyForTest(CHAIN, { config })).svg).toBe(a);
    expect((await renderSankeyForTest(CHAIN, { config, tree: true })).svg).toBe(a);
  });

  it('draws an empty diagram as its three empty groups', async () => {
    const { svg } = await renderSankeyForTest({ nodes: [], links: [], warnings: [] });
    expect(svg).toMatch(
      /<g class="nodes"\/><g class="node-labels"[^>]*\/><g class="links"[^>]*\/><\/svg>$/
    );
  });

  it('has no theme-name or look branch: neo and default differ only in theme values', async () => {
    const neo = await renderSankeyForTest(CHAIN, { config: { theme: 'neo', look: 'neo' } });
    const def = await renderSankeyForTest(CHAIN, { config: { theme: 'default' } });
    const shape = (s: string) => s.replace(/ (style|font-family)="[^"]*"/g, '');
    expect(shape(neo.svg)).toBe(shape(def.svg));
  });
});
