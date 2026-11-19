import { describe, expect, it } from 'vitest';
import type { Edge, LayoutData, Node } from '../layoutData.ts';
import { resolveRenderedOrthogonalCrossings } from '../direction/materializedGeometry.ts';
import { toGraphView, topLaneGap, writeBackToLayoutData } from '../helpers.ts';
import { sugiyamaLayout } from '../pipeline.ts';
import { routeForDirection } from '../turnedRouting.ts';
import { layoutGraph, prepared } from './graphs.ts';

/**
 * The crossing cleanup keeps the candidates it builds between two nodes for its later calls on
 * the same layout (#843). A later call must reroute as a call that builds them afresh does: here
 * a second call on the node map the first call filled, against one on a copy of that map. The
 * routes are the router's, before any cleanup, so the calls have crossings to remove.
 */

/** Graphs per run: about 4 seconds alone. */
const CASES = 30;
/** Graphs in which the second call still changes routes (22 of the 30), so agreement is not only on "none". */
const MIN_CASES_REROUTED = 15;
/** The longest a run of every case may take: seconds alone, and CI is about 7x slower. */
const RUN_TIMEOUT_MS = 60_000;

function seededRandom(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

/** A graph of a few lanes, a chain and random links, laid out and routed, not yet cleaned up. */
function routed(seed: number): LayoutData {
  const random = seededRandom(seed);
  const laneCount = 2 + random(5);
  const nodeCount = 6 + random(40);
  const lanes: Record<string, string[]> = {};
  for (let l = 0; l < laneCount; l++) lanes[`L${l}`] = [];
  const ids = Array.from({ length: nodeCount }, (_, i) => `n${i}`);
  for (const id of ids) lanes[`L${random(laneCount)}`]!.push(id);
  const edges: [string, string][] = [];
  for (let i = 0; i + 1 < nodeCount; i++) edges.push([ids[i]!, ids[i + 1]!]);
  for (let k = random(nodeCount); k > 0; k--)
    edges.push([ids[random(nodeCount)]!, ids[random(nodeCount)]!]);
  const data = prepared(
    layoutGraph({ lanes, edges, size: { width: 60 + random(60), height: 40 }, titles: true })
  );
  const g = toGraphView(data);
  const nodeGap = data.config.flowchart.nodeSpacing;
  const layerGap = data.config.flowchart.rankSpacing;
  const { ordered, coordinates } = sugiyamaLayout(g, {
    nodeGap,
    laneGap: topLaneGap(data.nodes, nodeGap),
    layerGap,
    direction: 'TB',
  });
  writeBackToLayoutData(g, ordered, coordinates, { nodeGap, layerGap });
  routeForDirection(data, 'TB');
  return data;
}

const nodeMap = (nodes: readonly Node[]): Map<string, Node> => new Map(nodes.map((n) => [n.id, n]));
/** Each edge's points array, and a copy of its values. */
const snapshotOf = (edges: readonly Edge[]): [Edge, Edge['points'], string][] =>
  edges.map((e) => [e, e.points, JSON.stringify(e.points)]);
/** The edges with their points copied: all the pass changes. */
const copyOf = (edges: readonly Edge[]): Edge[] =>
  edges.map((e) => ({ ...e, ...(e.points ? { points: e.points.map((p) => ({ ...p })) } : {}) }));

describe('the crossing cleanup reuses its side candidates across calls (#843)', () => {
  it(
    'reroutes in a later call as a call that builds them afresh does',
    { timeout: RUN_TIMEOUT_MS },
    () => {
      let rerouted = 0;
      for (let seed = 1; seed <= CASES; seed++) {
        const data = routed(seed);
        const shared = nodeMap(data.nodes);
        const first: Edge[] = copyOf(data.edges);
        resolveRenderedOrthogonalCrossings(first, shared);
        const again: Edge[] = copyOf(first);
        resolveRenderedOrthogonalCrossings(again, shared);
        const afresh: Edge[] = copyOf(first);
        resolveRenderedOrthogonalCrossings(afresh, new Map(shared));
        expect(again, `seed ${seed}`).toEqual(afresh);
        if (JSON.stringify(again) !== JSON.stringify(first)) rerouted++;
      }
      expect(rerouted).toBeGreaterThanOrEqual(MIN_CASES_REROUTED);
    }
  );

  it('builds afresh for a node moved between calls', { timeout: RUN_TIMEOUT_MS }, () => {
    for (let seed = 1; seed <= CASES; seed++) {
      const data = routed(seed);
      const shared = nodeMap(data.nodes);
      const first: Edge[] = copyOf(data.edges);
      resolveRenderedOrthogonalCrossings(first, shared);
      // The same node objects, one of them moved: the kept candidates no longer fit.
      const moved = data.nodes.find((n) => !n.isGroup)!;
      moved.x = (moved.x ?? 0) + 37;
      const again: Edge[] = copyOf(first);
      resolveRenderedOrthogonalCrossings(again, shared);
      const afresh: Edge[] = copyOf(first);
      resolveRenderedOrthogonalCrossings(afresh, new Map(shared));
      expect(again, `seed ${seed}`).toEqual(afresh);
    }
  });

  it('replaces a route it moves and never edits one in place', { timeout: RUN_TIMEOUT_MS }, () => {
    // The kept candidates, and an edge's candidates kept between rounds, rely on this.
    let replaced = 0;
    for (let seed = 1; seed <= CASES; seed++) {
      const data = routed(seed);
      const edges: Edge[] = copyOf(data.edges);
      const before = snapshotOf(edges);
      resolveRenderedOrthogonalCrossings(edges, nodeMap(data.nodes));
      for (const [edge, points, values] of before) {
        expect(JSON.stringify(points), `seed ${seed}, ${edge.id}`).toBe(values);
        if (edge.points !== points) replaced++;
      }
    }
    expect(replaced).toBeGreaterThan(0);
  });
});
