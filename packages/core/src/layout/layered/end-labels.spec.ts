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

// Sweep: every edge of the layout fixtures gets both end labels, in px under each routing and in
// cells on the grid. Each end label must sit near its end, outside both of its edge's nodes, and
// clear of the edge's other labels; `validateLayout` / `validateGrid` must find nothing.

const labelled = (graph: LayoutGraph, start: Size, end: Size): LayoutGraph => ({
  ...graph,
  edges: graph.edges.map((e: LayoutEdge) => ({ ...e, startLabel: start, endLabel: end })),
});

function endProblems(graph: LayoutGraph, model: LayoutModel, near: number): string[] {
  const out: string[] = [];
  for (const e of graph.edges) {
    const placed = model.edges.get(e.id)!;
    const own = [model.nodes.get(e.source), model.nodes.get(e.target)].filter((b) => b);
    const ends = [
      ['start', e.startLabel!, placed.startLabel, placed.points[0]!],
      ['end', e.endLabel!, placed.endLabel, placed.points.at(-1)!],
    ] as const;
    for (const [name, size, at, p] of ends) {
      if (!at) {
        out.push(`${e.id}: no ${name} label`);
        continue;
      }
      const r = rect(at, size);
      if (reach(r, p) > near) out.push(`${e.id}: ${name} label far from its end`);
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
      expect([...validateLayout(graph, model), ...endProblems(graph, model, 16)]).toEqual([]);
    }
  );
});

const CELLS = [...cellFixtures(), ...randomCellFixtures(30), ...randomGroupFixtures(30)];

describe('layered: edge-end labels on every fixture edge (grid: 1)', () => {
  it.each(CELLS.map((f) => [f.name, f.graph] as const))('%s', (_, base) => {
    const graph = labelled(base, { width: 1, height: 1 }, { width: 3, height: 1 });
    const model = layered(graph);
    expect([...validateGrid(graph, model), ...endProblems(graph, model, 2)]).toEqual([]);
  });
});
