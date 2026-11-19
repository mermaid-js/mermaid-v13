import { describe, expect, it } from 'vitest';
import type { EdgeRef, Graph, Layering, NodeId } from '../helpers.ts';
import { toGraphView } from '../helpers.ts';
import { normalizeGraph } from '../phase0.helpers.ts';
import { removeCycles_DFS } from '../phase1.cycles.ts';
import { makeProperLayering } from '../phase2.dummies.ts';
import { assignLayers_Gravity } from '../phase2.gravity.ts';
import { assignLayers_LaneAwareCompact } from '../phase2.laneAwareCompact.ts';
import { orderLayers } from '../phase3.ordering.ts';
import { type GraphSpec, viewOf } from './graphs.ts';
import { edge, internalData } from './internalData.ts';
import { orderLayersReference } from './phase3OrderingReference.ts';

/**
 * Phase 3 scores a transpose swap by the crossings of the two nodes it swaps (#843). It must
 * order every layer as the plain version did, which recounts both layer pairs for each swap it
 * tries (`phase3OrderingReference.ts`). The cases are layerings drawn at random, with edges of
 * any span and either direction, repeated edges, nodes outside every lane and lanes in a given
 * order, and the layerings the engine's own phases make of random swimlane graphs.
 */

/** Cases of each kind per run. */
const CASES = 1500;
/**
 * Cases in which the order the sweeps end with differs from the order they start with, and in
 * which an edge points up between two neighbouring layers (the up sweep's transpose reads only
 * those): each kind of case must reach the swaps, not only agree on "no change".
 */
const MIN_CASES_REORDERED = 600;
const MIN_CASES_WITH_UPWARD_EDGES = 300;
/** The longest a run of every case may take: seconds alone, and CI is about 7x slower. */
const RUN_TIMEOUT_MS = 120_000;

/** Integers below a bound from a 32-bit linear congruential generator, the same for the same seed. */
function seededRandom(seed: number): (below: number) => number {
  let state = seed;
  return (below) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return Math.floor((state / 2 ** 32) * below);
  };
}

function shuffled<T>(items: readonly T[], random: (below: number) => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface Case {
  layering: Layering;
  graph: Graph;
  laneOrder?: string[];
}

/** A layering drawn at random over lanes, nodes outside them and ids no lane knows (dummies). */
function randomCase(seed: number): Case {
  const random = seededRandom(seed);
  const laneCount = random(5);
  const lanes: Record<string, string[]> = {};
  for (let l = 0; l < laneCount; l++) lanes[`L${l}`] = [];
  const ids: string[] = [];
  const outside: string[] = [];
  const nodeCount = 2 + random(24);
  for (let i = 0; i < nodeCount; i++) {
    const id = `n${i}`;
    ids.push(id);
    if (laneCount === 0 || random(6) === 0) outside.push(id);
    else lanes[`L${random(laneCount)}`]!.push(id);
  }
  const noLanes = random(5) === 0;
  const graph = noLanes
    ? toGraphView(
        internalData(
          ids.map((id) => ({ id })),
          []
        )
      )
    : viewOf({ lanes, nodes: outside } satisfies GraphSpec, { groups: false });
  const dummies = Array.from({ length: random(8) }, (_, i) => `\0placeholder\0${i}`);
  const all = [...ids, ...dummies];
  const layerCount = 1 + random(6);
  const layers: NodeId[][] = Array.from({ length: layerCount }, () => []);
  for (const id of all) layers[random(layerCount)]!.push(id);
  const edgeCount = random(3 * all.length);
  const edges: EdgeRef[] = [];
  for (let k = 0; k < edgeCount; k++) {
    const src = all[random(all.length)]!;
    const dst =
      random(8) === 0 && edges.length > 0
        ? edges[random(edges.length)]!.dst
        : all[random(all.length)]!;
    if (src === dst) continue;
    edges.push({ id: `e${k}`, src, dst, ref: edge({ id: `e${k}`, start: src, end: dst }) });
    if (random(10) === 0)
      edges.push({ id: `e${k}b`, src, dst, ref: edge({ id: `e${k}b`, start: src, end: dst }) });
  }
  const laneOrder = random(3) === 0 ? shuffled(Object.keys(lanes), random) : undefined;
  return {
    layering: {
      layers: layers.filter((l) => l.length > 0),
      rankOf: Object.fromEntries(layers.flatMap((l, r) => l.map((id) => [id, r]))),
      dummy: new Set(dummies),
    },
    graph: { ...graph, nodes: [...graph.nodes, ...dummies], edges },
    laneOrder,
  };
}

/** The proper layering the engine's phases make of a random swimlane graph. */
function pipelineCase(seed: number): Case {
  const random = seededRandom(seed);
  const laneCount = 1 + random(5);
  const lanes: Record<string, string[]> = {};
  for (let l = 0; l < laneCount; l++) lanes[`L${l}`] = [];
  const nodeCount = 2 + random(30);
  const ids = Array.from({ length: nodeCount }, (_, i) => `v${i}`);
  for (const id of ids) lanes[`L${random(laneCount)}`]!.push(id);
  const edges: [string, string][] = [];
  for (let i = 0; i + 1 < nodeCount; i++) if (random(3) !== 0) edges.push([ids[i]!, ids[i + 1]!]);
  for (let k = random(2 * nodeCount); k > 0; k--)
    edges.push([ids[random(nodeCount)]!, ids[random(nodeCount)]!]);
  const graph = normalizeGraph(viewOf({ lanes, edges }));
  const acyclic = removeCycles_DFS(graph).acyclic;
  const ignoreCrossLaneEdges = random(4) !== 0;
  const layering = ignoreCrossLaneEdges
    ? assignLayers_LaneAwareCompact(acyclic, { compactSingleInput: true, ignoreCrossLaneEdges })
    : assignLayers_Gravity(acyclic, {
        compactSingleInput: true,
        ignoreCrossLaneEdges,
        optimizeRanksByCrossings: random(2) === 0,
      });
  const proper = makeProperLayering(layering, acyclic);
  return { layering: proper.layering, graph: proper.graphWithDummies };
}

const copy = ({ layers, rankOf, dummy }: Layering): Layering => ({
  layers: layers.map((l) => [...l]),
  rankOf: { ...rankOf },
  dummy: dummy ? new Set(dummy) : undefined,
});

function hasUpwardEdgeBetweenNeighbours({ layering, graph }: Case): boolean {
  return graph.edges.some((e) => {
    const [from, to] = [layering.rankOf[e.src], layering.rankOf[e.dst]];
    return from !== undefined && to !== undefined && from === to + 1;
  });
}

/** How many of `CASES` cases from `make` were ordered as the plain version orders them. */
function compare(make: (seed: number) => Case): { reordered: number; upward: number } {
  let reordered = 0;
  let upward = 0;
  for (let seed = 1; seed <= CASES; seed++) {
    const c = make(seed);
    const expected = orderLayersReference(copy(c.layering), c.graph, { laneOrder: c.laneOrder });
    const actual = orderLayers(copy(c.layering), c.graph, { laneOrder: c.laneOrder });
    expect(actual, `seed ${seed}`).toEqual(expected);
    if (JSON.stringify(expected.layers) !== JSON.stringify(c.layering.layers)) reordered++;
    if (hasUpwardEdgeBetweenNeighbours(c)) upward++;
  }
  return { reordered, upward };
}

describe('phase 3 ordering scores a swap by the two nodes it swaps (#843)', () => {
  it('orders random layerings as the plain version does', { timeout: RUN_TIMEOUT_MS }, () => {
    const { reordered, upward } = compare(randomCase);
    expect(reordered).toBeGreaterThanOrEqual(MIN_CASES_REORDERED);
    expect(upward).toBeGreaterThanOrEqual(MIN_CASES_WITH_UPWARD_EDGES);
  });

  it(
    'orders the layerings of the phases as the plain version does',
    { timeout: RUN_TIMEOUT_MS },
    () => {
      expect(compare(pipelineCase).reordered).toBeGreaterThanOrEqual(MIN_CASES_REORDERED);
    }
  );
});
