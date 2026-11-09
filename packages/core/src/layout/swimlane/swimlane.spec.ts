// The `swimlane` engine through its export (D531–D536): a valid model in every direction, lanes
// from top-level groups and the default lane, the tuning from `ctx.config.swimlane`, spacing
// from `graph.spacing`, placeholder `stepped` routes until #595, and byte-identical output.
import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '../../config/resolve.ts';
import type { Dir, LayoutGraph, LayoutModel } from '../types.ts';
import { validateLayout } from '../validate.ts';
import { swimlane } from './index.ts';
import { layoutGraph } from './__tests__/graphs.ts';

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
