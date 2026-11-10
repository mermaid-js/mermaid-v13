// The `swimlane` engine through its export (D531–D536): a valid model in every direction, lanes
// from top-level groups and the default lane, the tuning from `ctx.config.swimlane`, spacing
// from `graph.spacing`, `stepped` routes from the orthogonal router, and byte-identical output.
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '../../config/resolve.ts';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { swimlane } from './index.ts';
import { layoutGraph } from './__tests__/graphs.ts';
import { runSwimlane } from './swimlane.ts';

const LABEL = { width: 30, height: 16 };

/** Lanes, a nested box, loose nodes, an empty lane, labels, a cycle, a self-loop, a lane edge. */
const mixed = (direction: Dir): LayoutGraph =>
  layoutGraph({
    direction,
    lanes: { Sales: ['A'], Empty: [], Ops: ['C', 'D'] },
    nested: { Intake: ['Sales', ['B']] },
    nodes: ['X'],
    edges: [
      ['A', 'B', LABEL],
      ['B', 'C'],
      ['C', 'D', LABEL],
      ['D', 'A'],
      ['X', 'C'],
      ['D', 'D'],
      ['A', 'Ops'],
      ['C', 'X', LABEL],
    ],
    size: { width: 90, height: 40 },
    spacing: { node: 50, rank: 50 },
    padding: 8,
    titles: true,
  });

const serialise = (m: LayoutModel): string =>
  JSON.stringify({ ...m, nodes: [...m.nodes], edges: [...m.edges], groups: [...m.groups] });

const withConfig = (swimlaneConfig: Record<string, boolean>) => ({
  config: { swimlane: swimlaneConfig } as unknown as ResolvedConfig,
});

describe.each(['TB', 'BT', 'LR', 'RL'] as const)('%s', (direction) => {
  const graph = mixed(direction);
  const model = swimlane(graph);

  it('lays the graph out validly', () => {
    expect(validateLayout(graph, model)).toEqual([]);
    expect(model.direction).toBe(direction);
  });

  it('routes every edge at right angles, ends on its boxes', () => {
    for (const [, e] of model.edges) {
      for (let i = 1; i < e.points.length; i++) {
        const [p, q] = [e.points[i - 1]!, e.points[i]!];
        expect(Math.abs(p.x - q.x) < 1e-9 || Math.abs(p.y - q.y) < 1e-9).toBe(true);
      }
    }
  });

  it('puts loose nodes in the default lane, which the model lists', () => {
    const lane = model.groups.get('__swimlane_default__')!;
    const x = model.nodes.get('X')!;
    expect(Math.abs(x.x - lane.x)).toBeLessThanOrEqual(lane.width / 2);
    expect(Math.abs(x.y - lane.y)).toBeLessThanOrEqual(lane.height / 2);
  });

  it('gives an empty lane a band of its own between its neighbours, in source order', () => {
    const cross = direction === 'LR' || direction === 'RL' ? 'y' : 'x';
    const order = ['__swimlane_default__', 'Sales', 'Empty', 'Ops'].map(
      (id) => model.groups.get(id)![cross]
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const empty = model.groups.get('Empty')!;
    expect(empty.width).toBeGreaterThan(0);
    expect(empty.height).toBeGreaterThan(0);
  });

  it('is byte-identical across runs', () => {
    const again = swimlane(mixed(direction));
    expect(serialise(again)).toBe(serialise(model));
    const tuned = withConfig({ automaticLaneOrdering: true, ignoreCrossLaneEdges: false });
    expect(serialise(swimlane(mixed(direction), tuned))).toBe(
      serialise(swimlane(mixed(direction), tuned))
    );
  });
});

describe('without lanes', () => {
  it('lays out a plain graph in one default lane', () => {
    const graph = layoutGraph({
      nodes: ['A', 'B', 'C'],
      edges: [
        ['A', 'B'],
        ['B', 'C'],
      ],
      size: { width: 40, height: 20 },
    });
    const model = swimlane(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    expect([...model.groups.keys()]).toEqual(['__swimlane_default__']);
  });

  it('lays out an empty graph as an empty drawing of its padding', () => {
    const model = swimlane({ ...layoutGraph({}), diagramPadding: 8 });
    expect(model).toMatchObject({ width: 16, height: 16 });
    expect(model.nodes.size + model.edges.size + model.groups.size).toBe(0);
  });
});

describe('inputs', () => {
  const crossLane = (): LayoutGraph =>
    layoutGraph({
      lanes: { L1: ['A', 'B'], L2: ['C'], L3: ['D'] },
      edges: [
        ['A', 'B'],
        ['A', 'D'],
        ['A', 'D'],
        ['B', 'D'],
        ['C', 'B'],
      ],
      size: { width: 60, height: 30 },
    });

  it('reads the tuning from ctx.config.swimlane', () => {
    const plain = swimlane(crossLane());
    const reordered = swimlane(crossLane(), withConfig({ automaticLaneOrdering: true }));
    const cross = (m: LayoutModel) =>
      ['L1', 'L2', 'L3'].sort((a, b) => m.groups.get(a)!.x - m.groups.get(b)!.x);
    expect(cross(plain)).toEqual(['L1', 'L2', 'L3']);
    expect(cross(reordered)).not.toEqual(['L1', 'L2', 'L3']);
    // A cross-lane edge into a lane's first node ranks it after the edge's source only when
    // cross-lane edges count.
    const chain = (): LayoutGraph =>
      layoutGraph({
        lanes: { L1: ['A', 'B'], L2: ['C'] },
        edges: [
          ['A', 'B'],
          ['B', 'C'],
        ],
        size: { width: 60, height: 30 },
      });
    const ys = (m: LayoutModel) => [...m.nodes].map(([id, n]) => [id, n.y]);
    expect(ys(swimlane(chain(), withConfig({ ignoreCrossLaneEdges: false })))).not.toEqual(
      ys(swimlane(chain()))
    );
  });

  it('spaces ranks by graph.spacing.rank', () => {
    const near = swimlane(crossLane());
    const far = swimlane({ ...crossLane(), spacing: { node: 40, rank: 200, edge: 10 } });
    const gap = (m: LayoutModel) => m.nodes.get('B')!.y - m.nodes.get('A')!.y;
    expect(gap(far) - gap(near)).toBe(100);
  });

  it('starts the drawing at diagramPadding', () => {
    const model = swimlane({ ...crossLane(), diagramPadding: 12 });
    const lefts = [...model.groups.values()].map((g) => g.x - g.width / 2);
    const tops = [...model.groups.values()].map((g) => g.y - g.height / 2);
    expect(Math.min(...lefts)).toBe(12);
    expect(Math.min(...tops)).toBe(12);
  });

  it('rejects an edge to an unknown node', () => {
    const graph = layoutGraph({ nodes: ['A'] });
    graph.edges.push({ id: 'e', source: 'A', target: 'nope', minLen: 1 });
    expect(() => swimlane(graph)).toThrow(/unknown target 'nope'/);
  });
});

describe('review cases (#593)', () => {
  it.each(['TB', 'LR'] as const)(
    '%s: gives an empty nested group a box in its lane',
    (direction) => {
      const graph = layoutGraph({
        direction,
        lanes: { A: ['a1', 'a2'], B: ['b1'] },
        nested: { N: ['B', []] },
        edges: [['a1', 'a2']],
        size: { width: 60, height: 30 },
        padding: 8,
        titles: true,
      });
      const model = swimlane(graph);
      expect(validateLayout(graph, model)).toEqual([]);
      const n = model.groups.get('N')!;
      expect(n.width).toBe(8 + 8 + 8);
      expect(n.height).toBe(21 + 8);
    }
  );

  it.each(['TB', 'LR'] as const)(
    '%s: puts the label of an edge from a lane in a row beside the other end',
    (direction) => {
      const graph = layoutGraph({
        direction,
        lanes: { A: ['a1'], B: ['b1'] },
        edges: [['A', 'b1', LABEL]],
        size: { width: 60, height: 30 },
      });
      const model = swimlane(graph);
      expect(validateLayout(graph, model)).toEqual([]);
      const label = model.edges.get('e0')!.label!;
      const b1 = model.nodes.get('b1')!;
      const lane = model.groups.get('B')!;
      // Beside b1, not on it, and inside b1's lane.
      expect(Math.abs(label.x - b1.x) + Math.abs(label.y - b1.y)).toBeGreaterThan(0);
      expect(Math.abs(label.x - lane.x)).toBeLessThanOrEqual(lane.width / 2);
      expect(Math.abs(label.y - lane.y)).toBeLessThanOrEqual(lane.height / 2);
    }
  );

  it.each(['TB', 'BT', 'LR', 'RL'] as const)('%s: places start and end labels', (direction) => {
    const end = { width: 12, height: 14 };
    const graph = layoutGraph({
      direction,
      lanes: { A: ['a1', 'a2'], B: ['b1'] },
      edges: [
        ['a1', 'a2'],
        ['a1', 'b1'],
      ],
      size: { width: 60, height: 30 },
    });
    for (const e of graph.edges) Object.assign(e, { startLabel: end, endLabel: end });
    const model = swimlane(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    for (const [, e] of model.edges) {
      const [first, last] = [e.points[0]!, e.points.at(-1)!];
      // Each sits near its own end of the route.
      const near = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.hypot(p.x - q.x, p.y - q.y) < 40;
      expect(near(e.startLabel!, first)).toBe(true);
      expect(near(e.endLabel!, last)).toBe(true);
    }
  });

  it('rejects bad sizes and spacing, with layered’s messages', () => {
    const base = () => layoutGraph({ lanes: { A: ['a', 'b'] }, edges: [['a', 'b']] });
    const cases: [string, (g: LayoutGraph) => void][] = [
      ['label width of edge', (g) => (g.edges[0]!.label = { width: -1, height: 1 })],
      ['label height of edge', (g) => (g.edges[0]!.endLabel = { width: 1, height: NaN })],
      ['title width of group', (g) => (g.groups[0]!.title = { width: Infinity, height: 1 })],
      ['spacing.node', (g) => (g.spacing = { ...g.spacing, node: -5 })],
      ['spacing.rank', (g) => (g.spacing = { ...g.spacing, rank: NaN })],
      ['diagramPadding', (g) => (g.diagramPadding = -1)],
    ];
    for (const [what, spoil] of cases) {
      const g = base();
      spoil(g);
      expect(() => swimlane(g), what).toThrow(RangeError);
      expect(() => swimlane(g), what).toThrow(what);
    }
  });

  it('throws a RangeError on grid: text output never hands this engine cells (D179)', () => {
    expect(() => swimlane({ ...layoutGraph({ nodes: ['a'] }), grid: 1 })).toThrow(RangeError);
  });

  it('places an empty lane beside its neighbours in the automatic lane order', () => {
    const graph = layoutGraph({
      lanes: { L1: ['a'], L2: ['b'], Empty: [], L3: ['c'], L4: ['d'] },
      edges: [
        ['a', 'd'],
        ['a', 'd'],
        ['a', 'd'],
        ['a', 'd'],
      ],
      size: { width: 40, height: 20 },
    });
    const tuning = { automaticLaneOrdering: true };
    const order = runSwimlane(graph, tuning).laneOrder!;
    expect(order).not.toEqual(['L1', 'L2', 'Empty', 'L3', 'L4']);
    const model = swimlane(graph, withConfig(tuning));
    const across = [...model.groups.keys()].sort(
      (a, b) => model.groups.get(a)!.x - model.groups.get(b)!.x
    );
    expect(across).toEqual(order);
    expect(validateLayout(graph, model)).toEqual([]);
  });

  it('keeps synthetic nodes apart from author ids that look like them', () => {
    const graph = layoutGraph({
      lanes: { A: ['a', 'edge-label-a-b-e0', 'placeholder-0', 'b'] },
      edges: [
        ['a', 'b', LABEL],
        ['a', 'placeholder-0'],
        ['placeholder-0', 'edge-label-a-b-e0'],
        ['edge-label-a-b-e0', 'b'],
      ],
      size: { width: 40, height: 20 },
    });
    graph.edges.push({ id: 'e0-to-label', source: 'a', target: 'b', minLen: 1 });
    const model = swimlane(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(model.nodes.get('edge-label-a-b-e0')!.width).toBe(40);
  });
});
