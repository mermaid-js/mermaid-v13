// Architecture's LayoutGraph builder (spec #525 T3, #607) on parser-produced models: sizes
// against v12's metrics (`svgDraw.ts`), the fields `compass` reads (D501), config and its
// warnings, and the invariant checks themselves. Labels are measured with `gridMeasurer` (10 px a
// character, 20 px a line), so the expected sizes are worked out by hand, not by the code under
// test.
import { describe, expect, it } from 'vitest';
import {
  layered,
  pxProfile,
  validateLayout,
  type LayoutGraph,
  type LayoutModel,
} from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import type { FontKey, Measurer } from '@mermaid-js/core/text';
import { createTheme, loadTheme } from '@mermaid-js/core/theme';
import { ARCHITECTURE_CONFIG_IGNORED, ARCHITECTURE_SETTINGS_IGNORED } from '../codes.ts';
import { architectureConfigDefaults } from '../generated/config-defaults.ts';
import { ART_SIZE } from '../render/builtins.ts';
import { contextFor, gridMeasurer, modelOf, themeNamed } from './fixtures.ts';
import { architectureLayoutProblems, layoutBytes } from './invariants.ts';
import { layoutArchitecture } from './layout.ts';
import { ARCHITECTURE_METRICS, architectureSizes } from './metrics.ts';
import { prepareArchitecture } from './prepare.ts';

async function prepared(source: string, config = {}, measurer?: Measurer) {
  const ctx = contextFor(compass, await themeNamed(), config, measurer);
  return { ...prepareArchitecture(modelOf(`architecture-beta\n${source}`), ctx), ctx };
}

const node = (graph: LayoutGraph, id: string) => graph.nodes.find((n) => n.id === id)!;
const group = (graph: LayoutGraph, id: string) => graph.groups.find((g) => g.id === id)!;

/** The theme's 16 px font, measured by `gridMeasurer` (20 px a line). */
const GRID_TEXT = { fontSize: 16, lineHeight: 20 };

describe('the metrics table (v12 svgDraw.ts)', () => {
  it("holds v12's lengths at the defaults", () => {
    expect(architectureSizes(GRID_TEXT)).toEqual({
      iconSize: 80,
      padding: 40,
      arrow: 80 / 6,
      labelWidth: 120,
      labelGap: 6,
      labelAt: { x: 40, y: 86 },
      groupIcon: 30,
      groupLabelGap: 4,
      groupDash: 8,
      anchorY: 40,
      arrowTip: 2,
      serviceCorner: 5,
      iconTextMargin: 1,
    });
  });

  it('scales with iconSize and padding as v12 did', () => {
    const s = architectureSizes(GRID_TEXT, 120, 20);
    expect([s.arrow, s.labelWidth, s.labelAt]).toEqual([20, 180, { x: 60, y: 126 }]);
    expect([s.groupIcon, s.groupDash, s.anchorY]).toEqual([15, 8, 60]);
  });

  it("hangs a service label's first line fontSize below the icon, as v12's dy=1em did (D762)", () => {
    // The first line's middle is 1em under the icon: its box starts fontSize − lineHeight / 2 down.
    expect(architectureSizes({ fontSize: 16, lineHeight: 20 }).labelAt.y - 80).toBe(6);
    expect(architectureSizes({ fontSize: 20, lineHeight: 24 }, 50).labelAt).toEqual({
      x: 25,
      y: 58,
    });
    expect(architectureSizes({ fontSize: 20, lineHeight: 24 }, 50).labelGap).toBe(8);
  });
});

describe('services and junctions', () => {
  it('a service is its icon with the label beneath, its side ends at the icon centre', async () => {
    const { graph, nodes } = await prepared('service a(server)[abcd]\nservice b(server)');
    // 80 for the icon, 16 − 20 / 2 = 6 of hang (D762), then the label's one 20 px line.
    expect(node(graph, 'a')).toEqual({
      id: 'a',
      width: 80,
      height: 106,
      anchorY: 40,
      shape: 'service',
    });
    expect(nodes[0]!.label).toMatchObject({ width: 40, height: 20 });
    expect(node(graph, 'b')).toMatchObject({ width: 80, height: 80, anchorY: 40 });
    expect(nodes[1]!.label).toBeUndefined();
  });

  it('a label wraps at iconSize × 1.5 and widens the box past the icon', async () => {
    const { graph, nodes } = await prepared('service a(server)[aaaaaaaaaa bbbbbbbbbb]');
    expect(nodes[0]!.label!.lines).toHaveLength(2);
    expect(node(graph, 'a')).toMatchObject({ width: 100, height: 126, anchorY: 40 });
    const wide = await prepared('service a(server)[aaaaaaaaaaaaaaaaaaaa]');
    expect(node(wide.graph, 'a').width).toBeLessThanOrEqual(120);
  });

  it("hangs the label from the theme's fontSize and grows the box by as much (D762)", async () => {
    const theme = createTheme(await loadTheme('default'), { themeVariables: { fontSize: '30px' } });
    const ctx = contextFor(compass, theme);
    const p = prepareArchitecture(modelOf('architecture-beta\nservice a[A]\nservice b'), ctx);
    // 30 − 20 / 2 = 20 under the icon; an unlabelled service stays its icon.
    expect(p.sizes.labelAt).toEqual({ x: 40, y: 100 });
    expect(node(p.graph, 'a')).toMatchObject({ width: 80, height: 120 });
    expect(node(p.graph, 'b')).toMatchObject({ width: 80, height: 80 });
  });

  it('a junction is a bare iconSize square in its group', async () => {
    const { graph, nodes } = await prepared('group g\njunction j in g');
    expect(node(graph, 'j')).toEqual({
      id: 'j',
      width: 80,
      height: 80,
      anchorY: 40,
      shape: 'junction',
      parent: 'g',
    });
    expect(nodes[0]).toEqual({ id: 'j', kind: 'junction', index: 0 });
  });

  it('measures every label in the theme font before layout (pitfall 16)', async () => {
    const fonts: FontKey[] = [];
    const recording: Measurer = {
      ...gridMeasurer,
      id: 'recording',
      width: (text, font, style) => {
        fonts.push(font);
        return gridMeasurer.width(text, font, style);
      },
    };
    const theme = await themeNamed();
    const ctx = contextFor(compass, theme, {}, recording);
    const model = modelOf(
      'architecture-beta\ngroup g[G]\nservice a[A] in g\nservice b[B]\na:R -[x]- L:b'
    );
    let laidOut = false;
    const p = prepareArchitecture(model, {
      ...ctx,
      layout: (g) => {
        laidOut = true;
        return compass(g);
      },
    });
    expect(laidOut).toBe(false);
    expect(fonts.length).toBeGreaterThanOrEqual(4);
    const want = { family: theme.value('fontFamily'), size: theme.number('fontSize'), weight: 400 };
    for (const f of fonts) expect(f).toMatchObject(want);
    expect(p.font).toEqual(want);
  });
});

describe('groups', () => {
  it('get padding on every side and a title band of their icon, then their label', async () => {
    const { graph } = await prepared(
      'group a(cloud)[ab]\ngroup b(cloud) in a\ngroup c[ab] in a\ngroup d in a'
    );
    const pad = { top: 40, right: 40, bottom: 40, left: 40 };
    expect(group(graph, 'a')).toEqual({ id: 'a', padding: pad, title: { width: 54, height: 30 } });
    expect(group(graph, 'b')).toEqual({
      id: 'b',
      parent: 'a',
      padding: pad,
      title: { width: 30, height: 30 },
    });
    // v12 starts a label 4 px past the corner with or without an icon (`svgDraw.ts:263`).
    expect(group(graph, 'c').title).toEqual({ width: 24, height: 20 });
    expect(group(graph, 'd').title).toBeUndefined();
  });

  it('keeps a title as one line, however long (v12 wrapped it at the drawn group width)', async () => {
    const { graph } = await prepared('group a[aaaaaaaaaa bbbbbbbbbb cccccccccc]');
    expect(group(graph, 'a').title).toEqual({ width: 324, height: 20 });
  });
});

describe('edges and align', () => {
  it('carry both sides, the {group} ends, the label size and the AST id', async () => {
    const { graph } = await prepared(
      [
        'group g',
        'group h',
        'service a in g',
        'service b in h',
        'service c',
        'a{group}:R -[abc]- L:b{group}',
        'a:B --> T:c',
        'c:L -- L:c',
        'a:B -- T:c',
      ].join('\n')
    );
    expect(graph.edges).toEqual([
      {
        id: 'edge:a->b',
        source: 'a',
        target: 'b',
        minLen: 1,
        sides: { source: 'right', target: 'left' },
        border: { source: true, target: true },
        label: { width: 30, height: 20 },
      },
      {
        id: 'edge:a->c',
        source: 'a',
        target: 'c',
        minLen: 1,
        sides: { source: 'bottom', target: 'top' },
      },
      {
        id: 'edge:c->c',
        source: 'c',
        target: 'c',
        minLen: 1,
        sides: { source: 'left', target: 'left' },
      },
      {
        id: 'edge:a->c@2',
        source: 'a',
        target: 'c',
        minLen: 1,
        sides: { source: 'bottom', target: 'top' },
      },
    ]);
  });

  it('turns a {group} on an ungrouped end into no border (D504)', async () => {
    const { graph } = await prepared(
      'group g\nservice a in g\nservice b\na{group}:R -- L:b{group}'
    );
    expect(graph.edges[0]!.border).toEqual({ source: true, target: false });
  });

  it('turns every align statement into one hint, in source order', async () => {
    const { graph } = await prepared(
      'service a\nservice b\nservice c\njunction j\nalign row a b c\nalign column a j'
    );
    expect(graph.align).toEqual([
      { axis: 'row', members: ['a', 'b', 'c'] },
      { axis: 'column', members: ['a', 'j'] },
    ]);
    expect((await prepared('service a')).graph.align).toBeUndefined();
  });

  it("hands the engine v12's margin, core's spacing, and nodes in model order", async () => {
    const { graph } = await prepared('junction j\nservice a\ngroup g\nservice b in g');
    expect(graph.diagramPadding).toBe(40);
    expect(graph.spacing).toEqual(pxProfile.builder.spacing);
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'j']);
  });
});

describe('config', () => {
  it('reads architecture.iconSize and architecture.padding, numeric strings too', async () => {
    const { graph, sizes, ctx } = await prepared('group g[ab]\nservice a[abcd] in g', {
      architecture: { iconSize: 100, padding: '10' },
    });
    expect([sizes.iconSize, sizes.padding]).toEqual([100, 10]);
    expect(node(graph, 'a')).toMatchObject({ width: 100, height: 126, anchorY: 50 });
    expect(group(graph, 'g').padding).toEqual({ top: 10, right: 10, bottom: 10, left: 10 });
    expect(ctx.warnings).toEqual([]);
  });

  it.each([
    [{ iconSize: 'big' }, 'architecture.iconSize'],
    [{ iconSize: 1e4 }, 'architecture.iconSize'],
    [{ iconSize: 1e308 }, 'architecture.iconSize'],
    [{ iconSize: '1e9' }, 'architecture.iconSize'],
    [{ padding: -1 }, 'architecture.padding'],
    [{ padding: Number.NaN }, 'architecture.padding'],
    [{ padding: 1e9 }, 'architecture.padding'],
    [{ padding: 1e308 }, 'architecture.padding'],
  ])('lays out %j with the default and warns (pitfall 22)', async (conf, path) => {
    const { sizes, ctx } = await prepared('service a', { architecture: conf });
    expect([sizes.iconSize, sizes.padding]).toEqual([80, 40]);
    expect(ctx.warnings).toEqual([
      expect.objectContaining({ code: ARCHITECTURE_CONFIG_IGNORED, path }),
    ]);
  });

  it('takes 0 and anything under 10000, as the other ports read lengths', async () => {
    const src = 'group g[G]\nservice a[A] in g\nservice b[B]\na:R -- L:b';
    for (const conf of [{ padding: 0 }, { iconSize: 0 }, { iconSize: 9999, padding: 9999 }]) {
      const { graph, sizes, ctx } = await prepared(src, { architecture: conf });
      expect(sizes, JSON.stringify(conf)).toMatchObject(conf);
      expect(ctx.warnings).toEqual([]);
      expect(validateLayout(graph, compass(graph))).toEqual([]);
    }
  });

  it('warns once per key, with both keys wrong', async () => {
    const { ctx } = await prepared('service a', { architecture: { iconSize: -1, padding: 1e9 } });
    expect(ctx.warnings.map((w) => w.path)).toEqual([
      'architecture.iconSize',
      'architecture.padding',
    ]);
  });
});

describe('settings v13 does not read (D763)', () => {
  const ALL = {
    useWidth: 99,
    fontSize: 20,
    seed: 7,
    numIter: 5,
    edgeElasticity: 0.9,
    idealEdgeLengthMultiplier: 3,
    nodeSeparation: 300,
    randomize: true,
  };

  it('warns once, naming every set key in one fixed order, whatever order they were written in', async () => {
    const { ctx } = await prepared('service a[A]', { architecture: ALL });
    expect(ctx.warnings).toHaveLength(1);
    const [w] = ctx.warnings as { code: string; message: string; path?: string }[];
    expect(w!.code).toBe(ARCHITECTURE_SETTINGS_IGNORED);
    expect(w!.path).toBe('architecture.randomize');
    const named = [
      'randomize',
      'nodeSeparation',
      'idealEdgeLengthMultiplier',
      'edgeElasticity',
      'numIter',
      'seed',
      'fontSize',
      'useWidth',
    ];
    const at = named.map((k) => w!.message.indexOf(`architecture.${k}`));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(w!.message).toContain('`compass`');
    expect(w!.message).toContain('fcose');
    expect(w!.message).toContain('themeVariables.fontSize');
    expect(w!.message).toContain('never read');
  });

  it('names only what is set, and says only what applies to it', async () => {
    const { ctx } = await prepared('service a[A]', {
      architecture: { seed: 7, idealEdgeLengthMultiplier: 3 },
    });
    expect(ctx.warnings).toHaveLength(1);
    const { message, code } = ctx.warnings[0] as { code: string; message: string };
    expect(code).toBe(ARCHITECTURE_SETTINGS_IGNORED);
    expect(message).toMatch(/architecture\.idealEdgeLengthMultiplier.*architecture\.seed/);
    expect(message).not.toContain('randomize');
    expect(message).not.toContain('themeVariables');
    expect(message).not.toContain('useWidth');
  });

  it('warns for a key set to its v12 default, which is still set', async () => {
    const { ctx } = await prepared('service a[A]', { architecture: { seed: 1, fontSize: 16 } });
    expect(ctx.warnings.map((w) => w.code)).toEqual([ARCHITECTURE_SETTINGS_IGNORED]);
  });

  it('says nothing when none is set, nor for the keys it reads', async () => {
    const plain = await prepared('service a[A]');
    expect(plain.ctx.warnings).toEqual([]);
    const read = await prepared('service a[A]', {
      architecture: { iconSize: 60, padding: 20, useMaxWidth: false },
    });
    expect(read.ctx.warnings).toEqual([]);
  });

  it('lays out the same with every key set (they are read by nothing)', async () => {
    const src = 'group g[G]\nservice a[A] in g\nservice b[B]\na:R -[x]- L:b';
    const plain = await prepared(src);
    const set = await prepared(src, { architecture: ALL });
    expect(set.graph).toEqual(plain.graph);
    expect(set.sizes).toEqual(plain.sizes);
  });
});

describe('layoutArchitecture', () => {
  it('lays the built graph out with ctx.layout and keeps the views', async () => {
    const ctx = contextFor(compass, await themeNamed());
    const graphs: LayoutGraph[] = [];
    const model = modelOf('architecture-beta\nservice a[A]\nservice b[B]\na:R -- L:b');
    const layout = layoutArchitecture(model, {
      ...ctx,
      layout: (g) => {
        graphs.push(g);
        return compass(g);
      },
    });
    expect(graphs).toHaveLength(1);
    expect(layout.architecture.graph).toBe(graphs[0]);
    expect(layout.nodes.get('a')!.x).toBeLessThan(layout.nodes.get('b')!.x);
    expect(architectureLayoutProblems(graphs[0]!, layout)).toEqual([]);
  });

  // DESIGN §6.1: the graph is plain data, so it survives a JSON capture (no function on it).
  it('builds a graph of plain data', async () => {
    const { graph } = await prepared('service a\nservice b\na:R -- L:b');
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  });

  // D718: under `layered`, architecture draws each line out of the sides it names, after layout.
  it('draws lines out of their named sides under layered', async () => {
    const ctx = contextFor(layered, await themeNamed(), { layout: 'layered' });
    const model = modelOf('architecture-beta\nservice a[A]\nservice b[B]\na:L -- T:b');
    const laid = layoutArchitecture(model, ctx);
    const [edge] = laid.edges.values();
    expect(edge!.ports).toEqual({ source: 'left', target: 'top' });
  });

  it('gives the same bytes on every run', async () => {
    const src =
      'architecture-beta\ngroup g\nservice a[A] in g\nservice b[B]\njunction j\na:R -- L:j\nj:B -- T:b';
    const run = async () =>
      layoutBytes(layoutArchitecture(modelOf(src), contextFor(compass, await themeNamed())));
    expect(await run()).toBe(await run());
  });
});

describe('the invariant checks', () => {
  const src = 'architecture-beta\nservice a\nservice b\nservice c\na:R -- L:b\nalign column a c';
  async function laid(): Promise<{ graph: LayoutGraph; model: LayoutModel }> {
    const { graph } = await prepared(src.replace('architecture-beta\n', ''));
    return { graph, model: compass(graph) };
  }

  it('pass on a good layout', async () => {
    const { graph, model } = await laid();
    expect(architectureLayoutProblems(graph, model)).toEqual([]);
  });

  it('catch an end on the wrong side, a bent facing edge and a broken align', async () => {
    const { graph, model } = await laid();
    const e = model.edges.get('edge:a->b')!;
    const [p0, p1] = [e.points[0]!, e.points[e.points.length - 1]!];
    const bent = {
      ...e,
      points: [
        p0,
        { x: (p0.x + p1.x) / 2, y: p0.y, axis: 'h' as const },
        { x: (p0.x + p1.x) / 2, y: p0.y + 1, axis: 'v' as const },
        p1,
      ],
      ports: { source: 'top' as const, target: 'left' as const },
    };
    const c = model.nodes.get('c')!;
    const broken: LayoutModel = {
      ...model,
      edges: new Map([['edge:a->b', bent]]),
      nodes: new Map([...model.nodes, ['c', { ...c, x: c.x + 1 }]]),
    };
    const problems = architectureLayoutProblems(graph, broken);
    expect(problems).toEqual([
      "edge 'edge:a->b' source port is top, not right",
      "facing edge 'edge:a->b' between nodes in line is not straight",
      "align column: 'a' and 'c' do not share it in order",
    ]);
  });
});

describe('one source of truth for the length defaults (#618)', () => {
  it('takes iconSize and padding from the generated section defaults; the icon art stays 80', () => {
    expect(ARCHITECTURE_METRICS.iconSize).toBe(architectureConfigDefaults.iconSize);
    expect(ARCHITECTURE_METRICS.padding).toBe(architectureConfigDefaults.padding);
    expect(ART_SIZE).toBe(80);
  });
});
