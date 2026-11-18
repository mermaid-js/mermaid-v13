import { describe, expect, it } from 'vitest';
import type { LayoutEdge, LayoutGraph, LayoutModel, Point, Size } from '../types.ts';
import { validateGrid } from '../validate-grid.ts';
import { validateLayout } from '../validate.ts';
import { cellFixtures, randomCellFixtures, randomGroupFixtures } from './grid.fixtures.ts';
import { handBuiltFixtures } from './layered.fixtures.ts';
import { cellProfile, pxProfile } from '../units.ts';
import { layered } from './index.ts';

// Edge-end labels (D102): a small label beside each end of an edge, as class multiplicities.
const ONE: Size = { width: 10, height: 20 };
const MANY: Size = { width: 14, height: 20 };

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const rect = (c: Point, s: Size): Rect => ({
  x0: c.x - s.width / 2,
  y0: c.y - s.height / 2,
  x1: c.x + s.width / 2,
  y1: c.y + s.height / 2,
});
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// Distance from a point to the nearest point of a box.
const reach = (r: Rect, p: Point): number =>
  Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));

function pair(direction: LayoutGraph['direction']): LayoutGraph {
  return {
    direction,
    nodes: [
      { id: 'a', width: 80, height: 40 },
      { id: 'b', width: 80, height: 40 },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', minLen: 1, startLabel: ONE, endLabel: MANY }],
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
  };
}

describe('layered: edge-end labels', () => {
  it('places a label beside each end of a TB edge, outside both nodes', () => {
    const model: LayoutModel = layered(pair('TB'));
    const e = model.edges.get('ab')!;
    const a = model.nodes.get('a')!;
    const b = model.nodes.get('b')!;
    const start = rect(e.startLabel!, ONE);
    const end = rect(e.endLabel!, MANY);
    for (const r of [start, end]) {
      expect(overlaps(r, rect(a, a))).toBe(false);
      expect(overlaps(r, rect(b, b))).toBe(false);
    }
    expect(overlaps(start, end)).toBe(false);
    expect(reach(start, e.points[0]!)).toBeLessThan(12);
    expect(reach(end, e.points.at(-1)!)).toBeLessThan(16);
    // Below the source, above the target.
    expect(start.y0).toBeGreaterThanOrEqual(a.y + a.height / 2);
    expect(end.y1).toBeLessThanOrEqual(b.y - b.height / 2);
  });
});

describe('layered: edge-end labels clear of end markers (#201)', () => {
  // Two edges out of one side of a narrow source, as `Dog "1" *-- Leg` and `Dog o-- Toy`.
  const DIAMOND = { length: 20, width: 12 };
  const fan = (direction: LayoutGraph['direction'], markers: boolean): LayoutGraph => ({
    direction,
    nodes: [
      { id: 'a', width: 50, height: 80 },
      { id: 'b', width: 50, height: 80 },
      { id: 'c', width: 50, height: 80 },
    ],
    edges: [
      {
        id: 'ab',
        source: 'a',
        target: 'b',
        minLen: 1,
        startLabel: ONE,
        ...(markers ? { startMarker: DIAMOND } : {}),
      },
      {
        id: 'ac',
        source: 'a',
        target: 'c',
        minLen: 1,
        ...(markers ? { startMarker: DIAMOND } : {}),
      },
    ],
    groups: [],
    spacing: { node: 50, rank: 50, edge: 20 },
    routing: 'stepped',
  });
  // The box the source-end marker of edge `id` covers.
  const markerBox = (model: LayoutModel, id: string, side: 'source'): Rect => {
    const e = model.edges.get(id)!;
    const p = e.points[0]!;
    const out = e.ports[side];
    const h = DIAMOND.width / 2;
    const l = DIAMOND.length;
    if (out === 'bottom') return { x0: p.x - h, y0: p.y, x1: p.x + h, y1: p.y + l };
    if (out === 'top') return { x0: p.x - h, y0: p.y - l, x1: p.x + h, y1: p.y };
    if (out === 'right') return { x0: p.x, y0: p.y - h, x1: p.x + l, y1: p.y + h };
    return { x0: p.x - l, y0: p.y - h, x1: p.x, y1: p.y + h };
  };
  it.each(['TB', 'BT', 'LR', 'RL'] as const)('%s: the label misses both markers', (dir) => {
    const model = layered(fan(dir, true));
    const label = rect(model.edges.get('ab')!.startLabel!, ONE);
    for (const id of ['ab', 'ac']) {
      const m = markerBox(model, id, 'source');
      const e = 1e-6;
      expect(
        label.x0 < m.x1 - e && m.x0 < label.x1 - e && label.y0 < m.y1 - e && m.y0 < label.y1 - e,
        `${dir}: label on the marker of ${id}`
      ).toBe(false);
    }
  });
  it('markers move the label off its neighbour, not the route (TB)', () => {
    const plain = layered(fan('TB', false));
    const marked = layered(fan('TB', true));
    expect(marked.edges.get('ab')!.points).toEqual(plain.edges.get('ab')!.points);
    expect(marked.edges.get('ab')!.startLabel).not.toEqual(plain.edges.get('ab')!.startLabel);
  });
});

// Which way the flow runs in each direction, as the axis and sign of source → target.
const FLOW = {
  TB: ['y', 1],
  BT: ['y', -1],
  LR: ['x', 1],
  RL: ['x', -1],
} as const;

describe('layered: edge-end labels in each direction', () => {
  const cases = (['TB', 'BT', 'LR', 'RL'] as const).flatMap((dir) =>
    [false, true].map((cells) => [dir, cells ? 'cells' : 'px', cells] as const)
  );
  it.each(cases)('%s in %s: start after the source, end before the target', (dir, _, cells) => {
    const base = pair(dir);
    const one: Size = cells ? { width: 1, height: 1 } : ONE;
    const many: Size = cells ? { width: 3, height: 1 } : MANY;
    const graph: LayoutGraph = {
      ...base,
      nodes: cells ? base.nodes.map((n) => ({ ...n, width: 7, height: 3 })) : base.nodes,
      edges: [
        {
          ...base.edges[0]!,
          startLabel: one,
          endLabel: many,
          label: cells ? { width: 4, height: 1 } : { width: 40, height: 20 },
        },
      ],
      spacing: cells ? { node: 2, rank: 4, edge: 1 } : base.spacing,
      headRoom: cells ? 1 : 7,
      ...(cells ? { grid: 1, metrics: cellProfile().engine } : {}),
    };
    const model = layered(graph);
    expect(cells ? validateGrid(graph, model) : validateLayout(graph, model)).toEqual([]);
    const e = model.edges.get('ab')!;
    const [axis, sign] = FLOW[dir];
    const dim = axis === 'x' ? 'width' : 'height';
    const a = model.nodes.get('a')!;
    const b = model.nodes.get('b')!;
    const lo = (c: Point, s: Size): number => sign * c[axis] - s[dim] / 2;
    const hi = (c: Point, s: Size): number => sign * c[axis] + s[dim] / 2;
    // In flow order: source, start label, middle label, end label, target.
    expect(lo(e.startLabel!, one)).toBeGreaterThanOrEqual(hi(a, a));
    expect(hi(e.startLabel!, one)).toBeLessThanOrEqual(lo(e.label!, graph.edges[0]!.label!));
    expect(lo(e.endLabel!, many)).toBeGreaterThanOrEqual(hi(e.label!, graph.edges[0]!.label!));
    expect(hi(e.endLabel!, many)).toBeLessThanOrEqual(lo(b, b));
  });

  it('reads its offsets from the metrics', () => {
    const graph = pair('TB');
    const wider = { ...pxProfile.engine, endLabelAcross: pxProfile.engine.endLabelAcross + 10 };
    const plain = layered(graph).edges.get('ab')!;
    const moved = layered({ ...graph, metrics: wider }).edges.get('ab')!;
    expect(Math.abs(moved.startLabel!.x - plain.points[0]!.x)).toBe(
      Math.abs(plain.startLabel!.x - plain.points[0]!.x) + 10
    );
  });

  it('reports end labels off the grid', () => {
    const graph: LayoutGraph = { ...pair('TB'), grid: 1, metrics: cellProfile().engine };
    const cells: LayoutGraph = {
      ...graph,
      nodes: graph.nodes.map((n) => ({ ...n, width: 7, height: 3 })),
      spacing: { node: 2, rank: 4, edge: 1 },
      edges: [
        {
          ...graph.edges[0]!,
          startLabel: { width: 1, height: 1 },
          endLabel: { width: 2, height: 1 },
        },
      ],
    };
    const model = layered(cells);
    const e = model.edges.get('ab')!;
    e.startLabel = { x: e.startLabel!.x + 0.5, y: e.startLabel!.y };
    expect(validateGrid(cells, model)).toContainEqual("start label of 'ab' is off the grid");
  });
});

// One class with three relationships out of (or into) one side: every end label clear of every
// other label and of every node, and still beside its own end.
describe('layered: end labels of several edges on one side of a node', () => {
  const fan = (dir: LayoutGraph['direction'], cells: boolean, out: boolean): LayoutGraph => {
    const size = cells ? { width: 7, height: 3 } : { width: 80, height: 40 };
    const ids = ['a', 'b', 'c', 'd'];
    return {
      direction: dir,
      nodes: ids.map((id) => ({ id, ...size })),
      edges: ['b', 'c', 'd'].map((t) => ({
        id: `a${t}`,
        source: out ? 'a' : t,
        target: out ? t : 'a',
        minLen: 1,
        label: cells ? { width: 3, height: 1 } : { width: 30, height: 20 },
        startLabel: cells ? { width: 1, height: 1 } : ONE,
        endLabel: cells ? { width: 4, height: 1 } : { width: 28, height: 20 },
      })),
      groups: [],
      spacing: cells ? { node: 2, rank: 4, edge: 1 } : { node: 50, rank: 50, edge: 20 },
      headRoom: cells ? 1 : 7,
      ...(cells ? { grid: 1, metrics: cellProfile().engine } : {}),
    };
  };
  const cases = (['TB', 'BT', 'LR', 'RL'] as const).flatMap((dir) =>
    [false, true].flatMap((cells) =>
      [true, false].map(
        (out) => [dir, cells ? 'cells' : 'px', out ? 'out of' : 'into', cells, out] as const
      )
    )
  );
  it.each(cases)('%s in %s, three edges %s one side', (dir, _, __, cells, out) => {
    const graph = fan(dir, cells, out);
    const model = layered(graph);
    const problems = cells ? validateGrid(graph, model) : validateLayout(graph, model);
    const near = cells ? [2, 2] : [16, 32];
    expect([...problems, ...endProblems(graph, model, near[0]!, near[1]!)]).toEqual([]);
  });
});

// Edges with more bends than the engine cuts into pieces (MAX_DUMMIES) run straight from end to
// end, and their gaps get no room for end labels: placement still keeps the labels clear, here
// with room to spare since such an edge spans many ranks.
describe('layered: end labels on an edge drawn without bends', () => {
  it('places them clear of nodes and labels', () => {
    const graph: LayoutGraph = {
      ...pair('TB'),
      edges: [
        { id: 'ab', source: 'a', target: 'b', minLen: 30000, startLabel: ONE, endLabel: MANY },
      ],
    };
    const model = layered(graph);
    expect([...validateLayout(graph, model), ...endProblems(graph, model, 16, 32)]).toEqual([]);
  });
});

// Known limit on the grid: an edge between a group and its own member runs down from the group's
// top border, outside the layered gaps, so its ends get no room of their own. Its labels stay clear
// of every node, label, title, border row and route end, but the member end's label can land past
// the group's top border, outside the group.
describe('layered: end labels on a grid edge between a group and its member', () => {
  it('keeps them clear, outside the group if need be', () => {
    const base = cellFixtures().find((f) => f.name.startsWith('F4'))!.graph;
    const graph = labelled(base, { width: 1, height: 1 }, { width: 3, height: 1 });
    const model = layered(graph);
    expect(validateGrid(graph, model)).toEqual([]);
    const g = model.groups.get('g')!;
    const end = model.edges.get('g->B:abcd#1')!.endLabel!;
    expect(end.y).toBeLessThan(g.y - g.height / 2 + 0.5);
    // Clear of every route's end cell, where an arrowhead is drawn.
    const label = rect(end, { width: 3, height: 1 });
    for (const [id, e] of model.edges) {
      for (const p of [e.points[0]!, e.points.at(-1)!])
        expect(overlaps(label, rect(p, { width: 1, height: 1 })), id).toBe(false);
    }
  });
});

// Sweep: every edge of the layout fixtures gets both end labels, in px under each routing and in
// cells on the grid. Each end label must sit near its end, outside both of its edge's nodes, and
// clear of the edge's other labels; `validateLayout` / `validateGrid` must find nothing.

const labelled = (graph: LayoutGraph, start: Size, end: Size): LayoutGraph => ({
  ...graph,
  edges: graph.edges.map((e: LayoutEdge) => ({ ...e, startLabel: start, endLabel: end })),
});

// `near` is how far a label may sit from its end when nothing is in its way; each further end
// label on the same side of the same node may push it out by up to `stack` more (D102).
function endProblems(
  graph: LayoutGraph,
  model: LayoutModel,
  near: number,
  stack: number
): string[] {
  const out: string[] = [];
  const sides = new Map<string, number>();
  const key = (node: string, side: string): string => `${node} ${side}`;
  for (const e of graph.edges) {
    const { ports } = model.edges.get(e.id)!;
    for (const k of [key(e.source, ports.source), key(e.target, ports.target)])
      sides.set(k, (sides.get(k) ?? 0) + 1);
  }
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id)!;
    const own = [model.nodes.get(e.source), model.nodes.get(e.target)].filter((b) => b);
    const ends = [
      [
        'start',
        e.startLabel!,
        placed.startLabel,
        placed.points[0]!,
        key(e.source, placed.ports.source),
      ],
      [
        'end',
        e.endLabel!,
        placed.endLabel,
        placed.points.at(-1)!,
        key(e.target, placed.ports.target),
      ],
    ] as const;
    for (const [name, size, at, p, side] of ends) {
      if (!at) {
        out.push(`${e.id}: no ${name} label`);
        continue;
      }
      const r = rect(at, size);
      if (reach(r, p) > near + (sides.get(side)! - 1) * stack)
        out.push(`${e.id}: ${name} label far from its end`);
      for (const b of own)
        if (overlaps(r, rect(b!, b!))) out.push(`${e.id}: ${name} label on a node`);
    }
  }
  return out;
}

const PX = handBuiltFixtures();
const ROUTINGS = ['curved', 'stepped', 'straight'] as const;

describe('layered: edge-end labels on every fixture edge (px)', () => {
  it.each(PX.flatMap((f) => ROUTINGS.map((r) => [f.name, r, f.graph] as const)))(
    '%s, %s',
    (_, routing, base) => {
      const graph = labelled({ ...base, routing }, ONE, MANY);
      const model = layered(graph);
      expect([...validateLayout(graph, model), ...endProblems(graph, model, 16, 32)]).toEqual([]);
    }
  );
});

// F4 (edges between a group and its own members) is a known limit, specced above.
const CELLS = [...cellFixtures(), ...randomCellFixtures(60), ...randomGroupFixtures(120)].filter(
  (f) => !f.name.startsWith('F4')
);

describe('layered: edge-end labels on every fixture edge (grid: 1)', () => {
  it.each(CELLS.map((f) => [f.name, f.graph] as const))('%s', (_, base) => {
    const graph = labelled(base, { width: 1, height: 1 }, { width: 3, height: 1 });
    const model = layered(graph);
    expect([...validateGrid(graph, model), ...endProblems(graph, model, 2, 2)]).toEqual([]);
  });
});

// #363: an end label stands past its own end's marker (at the target, past `headRoom` where the
// marker is shorter), and `endLabelAlong` clear of its edge's middle label; the gap grows to it.
describe('layered: room for end labels past their markers (#363)', () => {
  const ALONG = pxProfile.engine.endLabelAlong;
  const LABEL: Size = { width: 40, height: 20 };
  const marked = (dir: LayoutGraph['direction'], length: number, label: boolean): LayoutGraph => ({
    ...pair(dir),
    edges: [
      {
        ...pair(dir).edges[0]!,
        ...(label ? { label: LABEL } : {}),
        startMarker: { length, width: 12 },
        endMarker: { length, width: 12 },
      },
    ],
    headRoom: 7,
    routing: 'stepped',
  });
  const cases = (['TB', 'BT', 'LR', 'RL'] as const).flatMap((dir) =>
    [20, 3].flatMap((length) => [true, false].map((label) => [dir, length, label] as const))
  );
  it.each(cases)('%s, marker %d, middle label %s', (dir, length, label) => {
    const graph = marked(dir, length, label);
    const model = layered(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    const e = model.edges.get('ab')!;
    const [axis, sign] = FLOW[dir];
    const dim = axis === 'x' ? 'width' : 'height';
    const lo = (c: Point, s: Size): number => sign * c[axis] - s[dim] / 2;
    const hi = (c: Point, s: Size): number => sign * c[axis] + s[dim] / 2;
    const a = model.nodes.get('a')!;
    const b = model.nodes.get('b')!;
    const eps = 1e-6;
    expect.soft(lo(e.startLabel!, ONE) - hi(a, a)).toBeGreaterThanOrEqual(ALONG + length - eps);
    expect
      .soft(lo(b, b) - hi(e.endLabel!, MANY))
      .toBeGreaterThanOrEqual(ALONG + Math.max(length, 7) - eps);
    if (!label) return;
    expect.soft(lo(e.label!, LABEL) - hi(e.startLabel!, ONE)).toBeGreaterThanOrEqual(ALONG - eps);
    expect.soft(lo(e.endLabel!, MANY) - hi(e.label!, LABEL)).toBeGreaterThanOrEqual(ALONG - eps);
  });

  it('moves nothing for markers on an edge without end labels', () => {
    const graph = marked('TB', 20, true);
    const bare: LayoutGraph = {
      ...graph,
      edges: graph.edges.map(({ startLabel: _s, endLabel: _e, ...e }) => e),
    };
    const plain: LayoutGraph = {
      ...bare,
      edges: bare.edges.map(({ startMarker: _s, endMarker: _e, ...e }) => e),
    };
    expect(layered(bare)).toEqual(layered(plain));
  });
});
