import { describe, expect, it } from 'vitest';
import type { Dir, LayoutGraph, LayoutModel, Point } from '../types.ts';
import { pxProfile } from '../units.ts';
import { countCrossings, validateLayout } from '../validate.ts';
import { hits, rectOf, type Rect } from './end-markers.ts';
import { layered } from './index.ts';
import { handBuiltFixtures, type LayoutFixture } from './layered.fixtures.ts';

// Hook for parser-produced fixtures: once the v13 flowchart parser and table measurer exist,
// graphs built from the e2e `.mmd` corpus join this list (from a spec in a package that may
// import the parser), and the same checks run over them.
const FIXTURES: LayoutFixture[] = handBuiltFixtures();

function plain(model: LayoutModel): unknown {
  return {
    ...model,
    nodes: [...model.nodes],
    edges: [...model.edges],
    groups: [...model.groups],
  };
}

describe('layered: DDLT checks on fixtures', () => {
  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s is a valid layout', (_, fixture) => {
    expect(validateLayout(fixture.graph, layered(fixture.graph))).toEqual([]);
  });

  it.each(FIXTURES.map((f) => [f.name, f] as const))('%s lays out the same twice', (_, fixture) => {
    const copy = JSON.parse(JSON.stringify(fixture.graph)) as typeof fixture.graph;
    expect(plain(layered(fixture.graph))).toEqual(plain(layered(copy)));
  });

  it('records crossing counts', () => {
    const counts = Object.fromEntries(
      FIXTURES.map((f) => [f.name, countCrossings(layered(f.graph))])
    );
    expect(counts).toMatchSnapshot();
  });
});

// #768 (D618): several self-loops on one node each get their own route. The second is mirrored to
// the far side, later ones nest outward, alternating sides, in the room reserveLoop keeps for each
// on its own side (#1173).
describe('layered: several self-loops on one node (#768, D618)', () => {
  const LABELS = [
    { width: 84, height: 24 },
    { width: 72, height: 24 },
    { width: 60, height: 40 },
    { width: 96, height: 24 },
  ];
  const loops = (dir: Dir, n: number, labelled = true): LayoutGraph => ({
    direction: dir,
    nodes: [{ id: 'R', width: 160, height: 90 }],
    edges: LABELS.slice(0, n).map((label, k) => ({
      id: `loop${k}`,
      source: 'R',
      target: 'R',
      minLen: 1,
      ...(labelled ? { label } : {}),
    })),
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    diagramPadding: 8,
  });
  const M = pxProfile.engine;
  // The node and the margin, with the room of each loop across the flow, once (#1173).
  const size = (g: LayoutGraph): [number, number] => {
    const node = g.nodes[0]!;
    const across = g.direction === 'TB' ? 'width' : 'height';
    let rooms = 0;
    for (const e of g.edges) rooms += M.loop + (e.label ? e.label[across] + M.loopGap : 0);
    const pad = 2 * (g.diagramPadding ?? 0);
    return g.direction === 'TB'
      ? [node.width + rooms + pad, node.height + pad]
      : [node.width + pad, node.height + rooms + pad];
  };
  const segments = (points: readonly Point[]): Rect[] =>
    points.slice(1).map((q, i) => {
      const p = points[i]!;
      return {
        x0: Math.min(p.x, q.x),
        y0: Math.min(p.y, q.y),
        x1: Math.max(p.x, q.x),
        y1: Math.max(p.y, q.y),
      };
    });
  const within = (m: LayoutModel, r: Rect): boolean =>
    r.x0 >= -1e-6 && r.y0 >= -1e-6 && r.x1 <= m.width + 1e-6 && r.y1 <= m.height + 1e-6;

  describe.each(['TB', 'LR'] as const)('%s', (dir) => {
    it.each([2, 4])('%i labelled loops: own routes, labels clear, inside, own room', (n) => {
      const g = loops(dir, n);
      const m = layered(g);
      const routes = g.edges.map((e) => m.edges.get(e.id)!);
      const labels = g.edges.map((e, k) => rectOf(routes[k]!.label!, e.label!));
      const box = rectOf(m.nodes.get('R')!, g.nodes[0]!);
      expect(new Set(routes.map((r) => JSON.stringify(r.points))).size).toBe(n);
      for (let i = 0; i < n; i++) {
        expect(within(m, labels[i]!), `label ${i} inside`).toBe(true);
        expect(hits(labels[i]!, box), `label ${i} off the node`).toBe(false);
        for (const s of segments(routes[i]!.points)) expect(within(m, s)).toBe(true);
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          if (j > i) expect(hits(labels[i]!, labels[j]!), `labels ${i}, ${j}`).toBe(false);
          for (const s of segments(routes[j]!.points))
            expect(hits(labels[i]!, s), `label ${i} on loop ${j}`).toBe(false);
        }
      }
      expect([m.width, m.height]).toEqual(size(g));
      expect(validateLayout(g, m)).toEqual([]);
    });

    it('keeps the first loop where a lone loop goes, and mirrors the second', () => {
      const one = layered(loops(dir, 1)).edges.get('loop0')!;
      const two = layered(loops(dir, 2));
      const sides = dir === 'TB' ? ['right', 'left'] : ['bottom', 'top'];
      const first = two.edges.get('loop0')!;
      const second = two.edges.get('loop1')!;
      const shift = two.nodes.get('R')!.x - layered(loops(dir, 1)).nodes.get('R')!.x || 0;
      expect(first.ports).toEqual(one.ports);
      expect(first.ports.source).toBe(sides[0]);
      expect(second.ports).toEqual({ source: sides[1], target: sides[1] });
      expect(first.points.map((p) => p.x - shift)).toEqual(one.points.map((p) => p.x));
    });

    it('gives unlabelled loops their own routes too', () => {
      const m = layered(loops(dir, 4, false));
      const routes = [0, 1, 2, 3].map((k) => JSON.stringify(m.edges.get(`loop${k}`)!.points));
      expect(new Set(routes).size).toBe(4);
    });
  });
});

// #1173: a self-loop is drawn on one side of its node, and the room laid out for the node grows
// on that side only. The node keeps its neighbours one node spacing away and its edges at its middle.
describe('layered: a self-loop takes room on its own side only (#1173)', () => {
  const M = pxProfile.engine;
  const PAD = 8;
  const SPACING = { node: 50, rank: 50, edge: 20 };
  const NODE = { width: 120, height: 40 };
  const LABEL = { width: 48, height: 24 };
  const graph = (dir: Dir, ids: string[], ends: [string, string][]): LayoutGraph => ({
    direction: dir,
    nodes: ids.map((id) => ({ id, ...NODE })),
    edges: ends.map(([source, target], k) => ({
      id: `e${k}`,
      source,
      target,
      minLen: 1,
      ...(source === target ? { label: LABEL } : {}),
    })),
    groups: [],
    spacing: SPACING,
    diagramPadding: PAD,
  });

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('%s: no band on the side without the loop', (dir) => {
    const m = layered(graph(dir, ['A'], [['A', 'A']]));
    const a = m.nodes.get('A')!;
    const down = dir === 'TB' || dir === 'BT';
    const room = M.loop + (down ? LABEL.width : LABEL.height) + M.loopGap;
    if (down) {
      expect(a.x - NODE.width / 2).toBe(PAD);
      expect(m.width).toBe(NODE.width + room + 2 * PAD);
    } else {
      expect(a.y - NODE.height / 2).toBe(PAD);
      expect(m.height).toBe(NODE.height + room + 2 * PAD);
    }
  });

  it('keeps a neighbour on the side without the loop one node spacing away', () => {
    const ends: [string, string][] = [
      ['T', 'B'],
      ['T', 'A'],
      ['A', 'A'],
    ];
    const m = layered(graph('TB', ['T', 'B', 'A'], ends));
    const a = m.nodes.get('A')!;
    const b = m.nodes.get('B')!;
    expect(b.x).toBeLessThan(a.x);
    expect(a.x - NODE.width / 2 - (b.x + NODE.width / 2)).toBe(SPACING.node);
  });

  it('keeps the loop clear of a neighbour on its own side', () => {
    const ends: [string, string][] = [
      ['T', 'A'],
      ['T', 'B'],
      ['A', 'A'],
    ];
    const m = layered(graph('TB', ['T', 'A', 'B'], ends));
    const loop = m.edges.get('e2')!;
    const reach = Math.max(...loop.points.map((p) => p.x), loop.label!.x + LABEL.width / 2);
    const b = m.nodes.get('B')!;
    expect(b.x - NODE.width / 2 - reach).toBe(SPACING.node);
  });

  it('gives a loop without a label only the reach of the loop', () => {
    const g = graph('TB', ['A'], [['A', 'A']]);
    const m = layered({ ...g, edges: g.edges.map(({ label: _, ...e }) => e) });
    expect(m.width).toBe(NODE.width + M.loop + 2 * PAD);
  });

  it('meets the edges of its node at its middle', () => {
    const m = layered(
      graph(
        'TB',
        ['X', 'A', 'Y'],
        [
          ['X', 'A'],
          ['A', 'A'],
          ['A', 'Y'],
        ]
      )
    );
    const a = m.nodes.get('A')!;
    expect(m.edges.get('e0')!.points.at(-1)!.x).toBe(a.x);
    expect(m.edges.get('e2')!.points[0]!.x).toBe(a.x);
  });

  // Small graphs with self-loops, some with a group, drawn from a fixed seed. Each loop and its
  // label stay off the other nodes and labels, and each node with its loops keeps a node spacing
  // from the nodes beside it in its rank. A room's bias read on the wrong side breaks one of the
  // two in some of them: when a label or bend is placed, a block is snapped, an end is pulled to
  // a held end, or the four placements are spaced.
  // Enough graphs, with the two below, for each side a bias is read on to matter in at least one
  // of them (measured by turning each side round: every such change breaks a check here).
  const GRAPHS = 400;
  // A linear congruential generator (glibc's constants), so the graphs are the same every run.
  const LCG = { a: 1103515245, c: 12345, mask: 0x7fffffff };
  // The graphs: a few nodes of flowchart-like sizes, about as many edges again, some labelled,
  // one to three loops, mostly labelled, now and then two nodes in a group, mostly top to bottom.
  // Each range is `[least, how many more]`, each share the chance of the thing it names.
  const SHAPE = {
    nodes: [3, 5],
    node: { width: [60, 100], height: [30, 30] },
    label: { width: [30, 60], height: [20, 10] },
    loops: [1, 3],
    grouped: 0.3,
    labelled: 0.4,
    loopLabelled: 0.8,
    downwards: 0.6,
    groupPadding: 20,
  } as const;
  const randomGraph = (seed: number): LayoutGraph => {
    let state = seed;
    const next = (): number => (state = (state * LCG.a + LCG.c) & LCG.mask) / LCG.mask;
    const pick = (n: number): number => Math.floor(next() * n);
    const within = ([least, more]: readonly [number, number]): number => least + pick(more);
    const count = within(SHAPE.nodes);
    const ids = Array.from({ length: count }, (_, i) => `n${i}`);
    const grouped = next() < SHAPE.grouped;
    const size = (): { width: number; height: number } => ({
      width: within(SHAPE.label.width),
      height: within(SHAPE.label.height),
    });
    // The second and third nodes go in the group, so it has two members and a node outside.
    const member = (i: number): boolean => grouped && i > 0 && i < 3;
    const nodes = ids.map((id, i) => ({
      id,
      width: within(SHAPE.node.width),
      height: within(SHAPE.node.height),
      ...(member(i) ? { parent: 'G' } : {}),
    }));
    const edges: LayoutGraph['edges'] = [];
    for (let k = 0, n = count + pick(count); k < n; k++) {
      const [a, b] = [pick(count), pick(count)];
      if (a === b) continue;
      const label = next() < SHAPE.labelled ? { label: size() } : {};
      const [source, target] = [ids[Math.min(a, b)]!, ids[Math.max(a, b)]!];
      edges.push({ id: `e${k}`, source, target, minLen: 1, ...label });
    }
    for (let k = 0, n = within(SHAPE.loops); k < n; k++) {
      const at = ids[pick(count)]!;
      edges.push({
        id: `l${k}`,
        source: at,
        target: at,
        minLen: 1,
        ...(next() < SHAPE.loopLabelled ? { label: size() } : {}),
      });
    }
    const pad = SHAPE.groupPadding;
    const padding = { top: pad, bottom: pad, left: pad, right: pad };
    return {
      direction: next() < SHAPE.downwards ? 'TB' : 'LR',
      nodes,
      edges,
      groups: grouped ? [{ id: 'G', padding }] : [],
      spacing: SPACING,
      diagramPadding: PAD,
    };
  };
  const span = (r: Rect, points: readonly Point[]): Rect =>
    points.reduce(
      (o, p) => ({
        x0: Math.min(o.x0, p.x),
        y0: Math.min(o.y0, p.y),
        x1: Math.max(o.x1, p.x),
        y1: Math.max(o.y1, p.y),
      }),
      r
    );
  // Lengths summed in floating point may miss a spacing by this much.
  const ROUNDING = 1e-6;
  const clash = (g: LayoutGraph, m: LayoutModel): string[] => {
    const out: string[] = [];
    const edge = new Map(g.edges.map((e) => [e.id, e]));
    const loops = g.edges.filter((e) => e.source === e.target);
    const labelRect = (id: string): Rect | undefined => {
      const at = m.edges.get(id)?.label;
      const size = edge.get(id)?.label;
      return at && size ? rectOf(at, size) : undefined;
    };
    const boxes = new Map<string, Rect>();
    for (const n of g.nodes) boxes.set(n.id, rectOf(m.nodes.get(n.id)!, n));
    for (const e of g.edges) {
      const r = labelRect(e.id);
      if (r) boxes.set(`label ${e.id}`, r);
    }
    // The room of each node: its box, its loops and their labels.
    const rooms = new Map<string, Rect>();
    for (const n of g.nodes) rooms.set(n.id, boxes.get(n.id)!);
    for (const l of loops) {
      const reach = span(rooms.get(l.source)!, m.edges.get(l.id)!.points);
      const r = labelRect(l.id);
      rooms.set(
        l.source,
        r
          ? span(reach, [
              { x: r.x0, y: r.y0 },
              { x: r.x1, y: r.y1 },
            ])
          : reach
      );
      const own = (key: string): boolean =>
        key === l.source || loops.some((o) => o.source === l.source && key === `label ${o.id}`);
      const route = span(
        rectOf(m.edges.get(l.id)!.points[0]!, { width: 0, height: 0 }),
        m.edges.get(l.id)!.points
      );
      for (const [key, b] of boxes) {
        if (own(key)) continue;
        if (hits(route, b)) out.push(`loop ${l.id} on ${key}`);
        if (r && hits(r, b)) out.push(`label of loop ${l.id} on ${key}`);
      }
    }
    const down = g.direction === 'TB';
    const parent = new Map(g.nodes.map((n) => [n.id, n.parent]));
    const ids = [...rooms.keys()];
    for (const [i, a] of ids.entries())
      for (const b of ids.slice(i + 1)) {
        if (parent.get(a) !== parent.get(b)) continue;
        const [p, q] = [rooms.get(a)!, rooms.get(b)!];
        const overlap = down
          ? Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0)
          : Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0);
        if (overlap <= 0) continue;
        const gap = down ? Math.max(q.x0 - p.x1, p.x0 - q.x1) : Math.max(q.y0 - p.y1, p.y0 - q.y1);
        if (gap < SPACING.node - ROUNDING) out.push(`${a} and ${b} ${gap} apart`);
      }
    return out;
  };

  it(`keeps loops clear of their neighbours in ${GRAPHS} small graphs`, () => {
    const found: string[] = [];
    for (let seed = 1; seed <= GRAPHS; seed++) {
      const g = randomGraph(seed);
      for (const c of clash(g, layered(g))) found.push(`graph ${seed}: ${c}`);
    }
    expect(found).toEqual([]);
  });

  // Of the four placements the narrowest is kept, measured by how far each node's room reaches
  // on each side. Reading the left reach on the right side keeps the same width here but moves
  // the nodes, so their places are pinned.
  it('measures the four placements by the left and right reach of each room', () => {
    const m = layered(randomGraph(8));
    const at = (id: string): [number, number] => [m.nodes.get(id)!.x, m.nodes.get(id)!.y];
    expect([at('n0'), at('n1'), at('n2')]).toEqual([
      [102.25, 23],
      [145, 132.5],
      [93, 225],
    ]);
  });

  // Two cases the seeded graphs do not reach: in LR, a node whose loops reach unevenly beside a
  // lone node, which the snap of bends moves; in TB, a node with two loops beside a group whose
  // ends are held, which the pull towards held ends moves.
  const UNEVEN_LOOPS: Omit<LayoutGraph, 'spacing' | 'diagramPadding'> = {
    direction: 'LR',
    nodes: [
      { id: 'n0', width: 153, height: 33 },
      { id: 'n1', width: 100, height: 33 },
      { id: 'n2', width: 60, height: 51 },
    ],
    edges: [
      { id: 'e0', source: 'n1', target: 'n2', minLen: 1 },
      { id: 'e1', source: 'n1', target: 'n2', minLen: 1 },
      { id: 'l0', source: 'n1', target: 'n1', minLen: 1 },
      { id: 'l1', source: 'n1', target: 'n1', minLen: 1, label: { width: 59, height: 25 } },
    ],
    groups: [],
  };
  const BESIDE_HELD_ENDS: Omit<LayoutGraph, 'spacing' | 'diagramPadding'> = {
    direction: 'TB',
    nodes: [
      { id: 'n0', width: 107, height: 58 },
      { id: 'n1', width: 71, height: 58, parent: 'G' },
      { id: 'n2', width: 99, height: 59, parent: 'G' },
      { id: 'n3', width: 116, height: 47 },
      { id: 'n4', width: 71, height: 51 },
    ],
    edges: [
      { id: 'e0', source: 'n0', target: 'n2', minLen: 1 },
      { id: 'e1', source: 'n2', target: 'n3', minLen: 1, label: { width: 36, height: 20 } },
      { id: 'e2', source: 'n0', target: 'n1', minLen: 1, label: { width: 54, height: 20 } },
      { id: 'e3', source: 'n1', target: 'n3', minLen: 1, label: { width: 59, height: 20 } },
      { id: 'e5', source: 'n0', target: 'n3', minLen: 1, label: { width: 70, height: 20 } },
      { id: 'l0', source: 'n4', target: 'n4', minLen: 1, label: { width: 43, height: 27 } },
      { id: 'l1', source: 'n1', target: 'n1', minLen: 1, label: { width: 35, height: 25 } },
      { id: 'l2', source: 'n4', target: 'n4', minLen: 1, label: { width: 51, height: 20 } },
    ],
    groups: [{ id: 'G', padding: { top: 20, bottom: 20, left: 20, right: 20 } }],
  };
  it.each([
    ['uneven loops beside a lone node', UNEVEN_LOOPS],
    ['two loops beside held ends', BESIDE_HELD_ENDS],
  ] as const)('keeps loops clear of their neighbours: %s', (_, shape) => {
    const g: LayoutGraph = { ...shape, spacing: SPACING, diagramPadding: PAD };
    expect(clash(g, layered(g))).toEqual([]);
  });
});
