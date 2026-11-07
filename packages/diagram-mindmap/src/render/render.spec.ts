// The mindmap renderer (spec #294 T4) through its own seam: parsed sources laid out with `tree`
// and drawn with core's render context (`renderMindmapForTest`). Structure and classes, the four
// families' paints (D152, D288), v12's edge widths, the `w.outline` hook (D302, D309) and the
// icon reference (D286, D291). The corpus properties are `conformance/src/mindmap/render.spec.ts`.
import { describe, expect, it } from 'vitest';
import type { Attrs, OutlineDraw } from '@mermaid-js/core/svg';
import { renderMindmapForTest } from './harness.ts';
import { edgeWidth } from './paint.ts';

const ALL_SHAPES = `mindmap
  root((The root))
    plain
      square[Square]
      round(Round)
    cloud)Cloud(
      bang))Bang((
    hex{{Hex}}
`;

/** Every element with `attr`'s value, by tag. */
function elements(svg: string, tag: string): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  for (const m of svg.matchAll(new RegExp(`<${tag}\\b([^>]*?)/?>`, 'g'))) {
    const attrs: Record<string, string> = {};
    for (const a of m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!;
    out.push(attrs);
  }
  return out;
}

const byClass = (svg: string, tag: string, cls: string) =>
  elements(svg, tag).filter((e) => (e.class ?? '').split(' ').includes(cls));

describe('structure', () => {
  it('draws the edges under the nodes, one g.mindmap-node per node with data-id and data-ast', async () => {
    const { svg, model } = await renderMindmapForTest(ALL_SHAPES, { config: { theme: 'default' } });
    expect(svg.indexOf('mindmap-edges')).toBeLessThan(svg.indexOf('mindmap-nodes'));
    const nodes = byClass(svg, 'g', 'mindmap-node');
    expect(nodes.map((n) => n['data-ast'])).toEqual(model.nodes.map((n) => n.ast));
    expect(nodes.every((n) => n['data-id'] === n['data-ast'])).toBe(true);
    expect(nodes[0]!.class).toBe('mindmap-node section-root section--1');
    expect(nodes[1]!.class).toBe('mindmap-node section-0');
    expect(nodes.at(-1)!.class).toBe('mindmap-node section-2');
    expect(elements(svg, '[a-z]+').filter((e) => e['data-ast'] !== undefined)).toHaveLength(
      model.nodes.length
    );
    expect(svg).not.toMatch(/\sid="/);
    expect(svg).toMatch(
      /<svg [^>]*class="mermaid mermaid-mindmap"[^>]*aria-roledescription="mindmap"/
    );
  });

  it('gives edges their v12 classes: section of the child, depth from the raw indent (GAPS #388)', async () => {
    const src = 'mindmap\nroot\n  a\n    b\n      c\n';
    const { svg } = await renderMindmapForTest(src, { config: { theme: 'default' } });
    const edges = byClass(svg, 'path', 'edge');
    expect(edges.map((e) => [e.class, e['data-id']])).toEqual([
      ['edge section-edge-0 edge-depth-1', 'edge:n:a'],
      ['edge section-edge-0 edge-depth-3', 'edge:n:b'],
      ['edge section-edge-0 edge-depth-5', 'edge:n:c'],
    ]);
    expect(edges.map((e) => e.fill)).toEqual(['none', 'none', 'none']);
    // `tree`'s two-point routes become one cubic each.
    expect(edges.every((e) => /^M[^MLQA]*C[^C]*$/.test(e.d!))).toBe(true);
  });

  it("adds the author's ::: classes to the node, characters outside [\\w-] dropped", async () => {
    const src = 'mindmap\nroot\n  a\n  :::urgent big<x>\n';
    const { svg } = await renderMindmapForTest(src);
    expect(byClass(svg, 'g', 'urgent')[0]!.class).toBe('mindmap-node section-0 urgent bigx');
  });

  it('honours mindmap.useMaxWidth', async () => {
    const wide = await renderMindmapForTest('mindmap\nroot');
    expect(wide.svg).toMatch(/<svg [^>]*width="100%"[^>]*style="max-width:/);
    const fixed = await renderMindmapForTest('mindmap\nroot', {
      config: { mindmap: { useMaxWidth: false } },
    });
    expect(fixed.svg).toMatch(/<svg [^>]*width="\d+" height="\d+"/);
  });
});

describe('edge widths (v12 styles.ts, pitfall 17)', () => {
  it('classic: 17 − 3i for .edge-depth-(i − 1), 3 where that is 0 or less or past depth 10', () => {
    expect([1, 2, 3, 4, 5, 6, 10, 11, 40].map((d) => edgeWidth(false, d))).toEqual([
      11, 8, 5, 2, 3, 3, 3, 3, 3,
    ]);
  });

  it('outlined: max(10 − 2d, 2), and .edge’s 3 past depth 10', () => {
    expect([1, 2, 3, 4, 5, 10, 11].map((d) => edgeWidth(true, d))).toEqual([8, 6, 4, 2, 2, 2, 3]);
  });

  it('draws them per family', async () => {
    const src = 'mindmap\nroot\n a\n  b\n';
    const widths = async (theme: string) =>
      byClass((await renderMindmapForTest(src, { config: { theme } })).svg, 'path', 'edge').map(
        (e) => e['stroke-width']
      );
    expect(await widths('default')).toEqual(['11', '8']);
    expect(await widths('redux')).toEqual(['8', '6']);
  });
});

describe('the four families (D152, D227, D288)', () => {
  const src = 'mindmap\nroot\n  a\n    b(round)\n';
  async function paints(theme: string, themeVariables?: Record<string, unknown>) {
    const r = await renderMindmapForTest(src, { config: { theme, themeVariables } });
    const bkg = elements(r.svg, '(?:path|rect|circle|polygon)').filter((e) =>
      (e.class ?? '').startsWith('node-bkg')
    );
    return {
      svg: r.svg,
      shapes: bkg.map((e) => e.class),
      fill: bkg.map((e) => e.fill),
      stroke: bkg.map((e) => e.stroke),
      filter: bkg.map((e) => e.filter),
      text: byClass(r.svg, 'text', 'mindmap-node-label').map((e) => e.fill),
      edges: byClass(r.svg, 'path', 'edge').map((e) => e.stroke),
      rules: elements(r.svg, 'line').map((e) => e.stroke),
    };
  }

  it('classic: cScale fills, cScaleLabel text, the root in git0 and gitBranchLabel0, no outline', async () => {
    const p = await paints('default', {
      cScale1: '#111111',
      cScaleLabel1: '#222222',
      cScaleInv1: '#333333',
      git0: '#444444',
      gitBranchLabel0: '#555555',
    });
    expect(p.shapes).toEqual([
      'node-bkg node-default',
      'node-bkg node-default',
      'node-bkg node-rounded',
    ]);
    expect(p.fill).toEqual(['#444444', '#111111', '#111111']);
    expect(p.text).toEqual(['#555555', '#222222', '#222222']);
    expect(p.stroke).toEqual([undefined, undefined, undefined]);
    expect(p.filter).toEqual([undefined, undefined, undefined]);
    expect(p.edges).toEqual(['#111111', '#111111']);
    // The rule under each plain node: the root's in cScaleInv0, the section's in its slot.
    expect(p.rules.at(-1)).toBe('#333333');
    expect(p.rules).toHaveLength(2);
    // Four rounded corners.
    const d = elements(p.svg, 'path').find((e) => e.class === 'node-bkg node-default')!.d!;
    expect(d.split('Q')).toHaveLength(5);
  });

  it('redux: plain nodes rounded, mainBkg with nodeBorder outline and text, the shadow, nodeBorder edges', async () => {
    const p = await paints('redux');
    expect(p.shapes).toEqual([
      'node-bkg node-rounded',
      'node-bkg node-rounded',
      'node-bkg node-rounded',
    ]);
    expect(p.fill).toEqual(['var(--_mb)', 'var(--_mb)', 'var(--_mb)']);
    expect(p.stroke).toEqual(['var(--_nb)', 'var(--_nb)', 'var(--_nb)']);
    expect(p.text).toEqual(['var(--_nb)', 'var(--_nb)', 'var(--_nb)']);
    expect(new Set(p.filter)).toEqual(new Set(['var(--_ds)']));
    expect(p.edges).toEqual(['var(--_nb)', 'var(--_nb)']);
    expect(p.rules).toEqual([]);
  });

  it('redux-color: per-item colour (borderColorArray) keeps the cScale fill and outline; the root mainBkg', async () => {
    const p = await paints('redux-color', {
      cScale0: '#101010',
      cScale1: '#111111',
      cScaleLabel1: '#222222',
    });
    expect(p.fill).toEqual(['var(--_mb)', '#111111', '#111111']);
    expect(p.stroke).toEqual(['#101010', '#111111', '#111111']);
    expect(p.text).toEqual(['var(--_nb)', '#222222', '#222222']);
    expect(p.edges).toEqual(['var(--_nb)', 'var(--_nb)']);
  });

  it('neo: flat-bottomed plain nodes on mainBkg with gradient outlines, cScale edges, no rule', async () => {
    const p = await paints('neo', {
      cScale1: '#111111',
      cScaleLabel0: '#202020',
      cScaleLabel1: '#222222',
    });
    expect(p.shapes).toEqual([
      'node-bkg node-default',
      'node-bkg node-default',
      'node-bkg node-rounded',
    ]);
    expect(p.fill).toEqual(['var(--_mb)', 'var(--_mb)', 'var(--_mb)']);
    expect(new Set(p.stroke)).toEqual(new Set(['url(#mermaid-0-gradient)']));
    expect(p.text).toEqual(['#202020', '#222222', '#222222']);
    expect(p.edges).toEqual(['#111111', '#111111']);
    expect(p.rules).toEqual([]);
    // Two rounded corners on top, a flat bottom.
    expect(elements(p.svg, 'path').find((e) => e.class === 'node-bkg node-default')!.d).toMatch(
      /^M[^Q]*Q[^Q]*Q[^Q]*Z$/
    );
    // Without the gradient: cScale fills and outlines, the root in git0, the rule in cScaleInv.
    const flat = await paints('neo', { useGradient: false, cScale1: '#111111', git0: '#444444' });
    expect(flat.fill).toEqual(['#444444', '#111111', '#111111']);
    expect(flat.stroke.slice(1)).toEqual(['#111111', '#111111']);
    expect(flat.rules).toHaveLength(2);
  });

  it('neo-dark: as neo, with nodeBorder edges', async () => {
    const p = await paints('neo-dark');
    expect(new Set(p.stroke)).toEqual(new Set(['url(#mermaid-0-gradient)']));
    expect(p.edges).toEqual(['var(--_nb)', 'var(--_nb)']);
  });

  it('follows the flags in any theme, not the theme name (D152)', async () => {
    const p = await paints('default', {
      mindmapRoundedNodes: true,
      mindmapOutlinedNodes: true,
      mindmapBorderEdges: true,
    });
    expect(p.shapes[0]).toBe('node-bkg node-rounded');
    expect(p.stroke).toEqual(['var(--_nb)', 'var(--_nb)', 'var(--_nb)']);
    expect(p.edges).toEqual(['var(--_nb)', 'var(--_nb)']);
  });
});

describe('the w.outline hook (D302, D309)', () => {
  it('draws all seven shapes, the rule and every edge through it, with their paint on the call', async () => {
    const calls: { role: string; tag: string; attrs: Attrs }[] = [];
    const record: OutlineDraw = (role, tag, attrs) => {
      calls.push({ role, tag, attrs });
      return false;
    };
    const plain = await renderMindmapForTest(ALL_SHAPES, { config: { theme: 'default' } });
    const r = await renderMindmapForTest(ALL_SHAPES, {
      config: { theme: 'default' },
      outline: record,
    });
    // A drawer that declines leaves the output byte-identical.
    expect(r.svg).toBe(plain.svg);
    const nodes = calls.filter((c) => c.role === 'node');
    expect(nodes.map((c) => `${c.tag} ${String(c.attrs.class)}`)).toEqual([
      'circle node-bkg node-circle',
      'path node-bkg node-default',
      'rect node-bkg node-rect',
      'rect node-bkg node-rounded',
      'path node-bkg node-cloud',
      'path node-bkg node-bang',
      'polygon node-bkg node-hexagon',
    ]);
    expect(nodes.every((c) => c.attrs.fill !== undefined)).toBe(true);
    expect(calls.filter((c) => c.role === 'divider').map((c) => c.tag)).toEqual(['line']);
    const edges = calls.filter((c) => c.role === 'edge');
    expect(edges).toHaveLength(r.model.nodes.length - 1);
    expect(edges.every((c) => c.tag === 'path' && c.attrs.stroke && c.attrs['stroke-width'])).toBe(
      true
    );
    // Nothing else draws a shape outside the hook.
    expect(r.svg.match(/<(?:rect|circle|polygon|path|line)\b/g)).toHaveLength(calls.length);
  });

  it('lets a drawer replace them', async () => {
    const sketch: OutlineDraw = (role, _tag, attrs, sink) => {
      sink.open('g', { class: `sketch-${role}` });
      sink.leaf('path', { d: sink.path().moveTo(0, 0).done(), stroke: attrs.stroke });
      sink.close();
      return true;
    };
    const { svg, model } = await renderMindmapForTest(ALL_SHAPES, { outline: sketch });
    expect(svg.match(/class="sketch-node"/g)).toHaveLength(model.nodes.length);
    expect(svg.match(/class="sketch-edge"/g)).toHaveLength(model.nodes.length - 1);
    expect(svg).not.toMatch(/<(?:rect|circle|polygon)\b/);
  });
});

describe('the ::icon() reference without an icons extension (D286, D291)', () => {
  it('is drawn as written in its slot, in the label slot colour, with one ICON_NOT_RENDERED', async () => {
    const src = 'mindmap\nroot\n  a\n  ::icon(fa fa-book)\n  b\n  ::icon( mdi:fire )\n';
    const r = await renderMindmapForTest(src, {
      config: { theme: 'default', themeVariables: { cScaleLabel1: '#123456' } },
    });
    const icons = byClass(r.svg, 'text', 'mindmap-icon');
    expect(icons.map((e) => e.fill)).toEqual(['#123456', expect.any(String)]);
    expect(r.svg).toMatch(/>fa fa-book</);
    expect(r.svg).toMatch(/>mdi:fire</);
    expect(r.warnings.filter((w) => w.code === 'ICON_NOT_RENDERED')).toHaveLength(1);
    // Inside its node's slot: left of the label.
    const slot = r.layout.mindmap.nodes[1]!.icon!;
    const at = r.layout.nodes.get('n:a')!;
    expect(Number(icons[0]!.x)).toBeCloseTo(at.x + slot.at.x, 1);
    expect(Number(icons[0]!['font-size'])).toBeLessThanOrEqual(
      r.layout.mindmap.nodes[1]!.icon!.size + 0.01
    );
  });

  it('gives no warning without icons', async () => {
    const r = await renderMindmapForTest('mindmap\nroot\n  a');
    expect(r.warnings).toEqual([]);
  });
});
