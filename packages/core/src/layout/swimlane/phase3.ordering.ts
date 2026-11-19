// Ported from v12 `swimlanes/phase3.ordering.ts` at upstream `c9b12739f` (D532). Changed (#843),
// with v12's orders kept: a transpose swap is scored by the crossings of the two nodes it swaps,
// each layer reads its nodes' edges from lists built once, and a sort takes each median once.
import { byCodeUnit } from './compare.ts';
import type { Graph, Layering, OrderedLayers, NodeId, Edge } from './helpers.ts';
import { buildLayerIndex, countInversions } from './phase0.helpers.ts';
import { createTopLaneResolver, resolveTopLaneOrder } from './phase2.options.ts';

type SweepDirection = 'down' | 'up';

function median(values: number[]): number {
  const n = values.length;
  if (n === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const a = [...values].sort((x, y) => x - y);
  if (n % 2 === 1) {
    return a[(n - 1) / 2]!;
  }
  return 0.5 * (a[n / 2 - 1]! + a[n / 2]!);
}

function barycenter(values: number[]): number {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const s = values.reduce((acc, v) => acc + v, 0);
  return s / values.length;
}

/** The edges at each node, in edge order: those that leave it and those that enter it. */
interface EdgesAtNodes {
  leaving: Map<NodeId, Edge[]>;
  entering: Map<NodeId, Edge[]>;
}

function edgesAtNodes(edges: Edge[]): EdgesAtNodes {
  const leaving = new Map<NodeId, Edge[]>();
  const entering = new Map<NodeId, Edge[]>();
  const add = (at: Map<NodeId, Edge[]>, id: NodeId, e: Edge): void => {
    const list = at.get(id);
    if (list) {
      list.push(e);
    } else {
      at.set(id, [e]);
    }
  };
  for (const e of edges) {
    add(leaving, e.src, e);
    add(entering, e.dst, e);
  }
  return { leaving, entering };
}

function neighborPositionsFor(
  targetNodes: NodeId[],
  fixedIndex: Map<NodeId, number>,
  edges: EdgesAtNodes,
  direction: SweepDirection
): Map<NodeId, number[]> {
  const neighborPositions = new Map<NodeId, number[]>();
  for (const v of targetNodes) {
    neighborPositions.set(v, []);
  }
  // Each node's edges in edge order, so each list is in edge order.
  for (const [v, positions] of neighborPositions) {
    const near = direction === 'down' ? edges.entering.get(v) : edges.leaving.get(v);
    for (const e of near ?? []) {
      const position = fixedIndex.get(direction === 'down' ? e.src : e.dst);
      if (position !== undefined) {
        positions.push(position);
      }
    }
  }
  return neighborPositions;
}

function currentOrderTieBreak(
  a: NodeId,
  b: NodeId,
  currentLayerIndex: Map<NodeId, number>
): number {
  const ia = currentLayerIndex.get(a) ?? 0;
  const ib = currentLayerIndex.get(b) ?? 0;
  return ia !== ib ? ia - ib : byCodeUnit(a, b);
}

function countCrossingsBetweenAdjacent(upper: NodeId[], lower: NodeId[], edges: Edge[]): number {
  // Filter edges between these two layers
  const upperSet = new Set(upper);
  const lowerSet = new Set(lower);
  const upperIndex = buildLayerIndex(upper);
  const lowerIndex = buildLayerIndex(lower);
  const pairs: { u: number; v: number }[] = [];
  for (const e of edges) {
    if (upperSet.has(e.src) && lowerSet.has(e.dst)) {
      pairs.push({ u: upperIndex.get(e.src)!, v: lowerIndex.get(e.dst)! });
    }
  }
  // Sort by u, count inversions in v
  pairs.sort((a, b) => (a.u === b.u ? a.v - b.v : a.u - b.u));
  const vs = pairs.map((p) => p.v);
  return countInversions(vs);
}

export function totalCrossings(layers: NodeId[][], edges: Edge[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < layers.length; i++) {
    sum += countCrossingsBetweenAdjacent(layers[i]!, layers[i + 1]!, edges);
  }
  return sum;
}

/**
 * Sort a subset of nodes by their median score relative to a fixed layer.
 * This is the core sorting logic extracted for reuse per-lane.
 */
function sortByHeuristic(
  nodes: NodeId[],
  neighborPositions: Map<NodeId, number[]>,
  currentLayerIndex: Map<NodeId, number>
): NodeId[] {
  // The comparator reads each node's median from here.
  const medians = new Map(nodes.map((id) => [id, median(neighborPositions.get(id) ?? [])]));
  return [...nodes].sort((a, b) => {
    const sa = medians.get(a)!;
    const sb = medians.get(b)!;
    if (sa === sb) {
      return currentOrderTieBreak(a, b, currentLayerIndex);
    }
    if (!isFinite(sa)) {
      return 1;
    }
    if (!isFinite(sb)) {
      return -1;
    }
    return sa - sb;
  });
}

/** Each node's barycenter, computed when first asked for and kept. */
function barycenterMemo(neighborPositions: Map<NodeId, number[]>): (id: NodeId) => number {
  const known = new Map<NodeId, number>();
  return (id) => {
    let bc = known.get(id);
    if (bc === undefined) {
      bc = barycenter(neighborPositions.get(id) ?? []);
      known.set(id, bc);
    }
    return bc;
  };
}

function reorderLayer(
  fixedLayer: NodeId[],
  targetLayer: NodeId[],
  edges: EdgesAtNodes,
  direction: SweepDirection,
  topLaneOf?: (id: NodeId) => string | null,
  laneOrder?: string[]
): NodeId[] {
  const fixedIndex = buildLayerIndex(fixedLayer);
  const currIndex = buildLayerIndex(targetLayer);
  const neighborPositions = neighborPositionsFor(targetLayer, fixedIndex, edges, direction);

  // If no lane info, fall back to flat reorder (original behavior)
  if (!topLaneOf || !laneOrder || laneOrder.length === 0) {
    return sortByHeuristic(targetLayer, neighborPositions, currIndex);
  }

  // Partition target layer nodes by lane
  const byLane = new Map<string | null, NodeId[]>();
  for (const id of targetLayer) {
    const lane = topLaneOf(id);
    const arr = byLane.get(lane) ?? [];
    arr.push(id);
    byLane.set(lane, arr);
  }

  // Reorder nodes within each lane independently
  const result: NodeId[] = [];

  // First, place lane-grouped nodes in lane order
  for (const lane of laneOrder) {
    const nodesInLane = byLane.get(lane);
    if (!nodesInLane || nodesInLane.length === 0) {
      continue;
    }
    const sorted = sortByHeuristic(nodesInLane, neighborPositions, currIndex);
    result.push(...sorted);
  }

  // Then, handle null-lane nodes (long-edge dummies without a parent).
  // Compute their barycenter and insert them adjacent to the lane whose
  // center position is closest to their barycenter.
  const nullNodes = byLane.get(null);
  if (nullNodes && nullNodes.length > 0) {
    // Sort null-lane nodes by their barycenter across the full layer
    const sorted = sortByHeuristic(nullNodes, neighborPositions, currIndex);
    const barycenterOf = barycenterMemo(neighborPositions);

    // For each null-lane node, find the best insertion position
    // based on its connections to nodes already in the result
    for (const nid of sorted) {
      // Compute the barycenter position of this node's neighbors in the fixed layer
      const bc = barycenter(neighborPositions.get(nid) ?? []);

      // Find the best insertion point: scan result and insert where the
      // node's barycenter fits relative to its neighbors
      result.splice(insertionIndex(bc, result, barycenterOf), 0, nid);
    }
  }

  return result;
}

/**
 * Where a null-lane node with barycenter `bc` goes: before the first node already placed whose
 * fixed-layer neighbour position is greater, or at the end.
 */
function insertionIndex(
  bc: number,
  result: NodeId[],
  barycenterOf: (id: NodeId) => number
): number {
  if (!isFinite(bc)) {
    return result.length;
  }
  for (const [i, rid] of result.entries()) {
    const rBc = barycenterOf(rid);
    if (bc < rBc) {
      return i;
    }
  }
  return result.length;
}

/**
 * The crossings between the edges at two neighbours of a layer, the one with `left` ends to the
 * left of the one with `right` ends: the pairs with an end in `left` past an end in `right`. Both
 * hold the positions of the edges' other ends, sorted.
 */
function crossingsOfNeighbours(left: readonly number[], right: readonly number[]): number {
  let count = 0;
  let below = 0;
  for (const position of left) {
    while (below < right.length && right[below]! < position) {
      below++;
    }
    count += below;
  }
  return count;
}

/** For each node of `layer`, the sorted positions in `other` of the far ends of `edgesOf` it. */
function farEndPositions(
  layer: NodeId[],
  edgesOf: Map<NodeId, Edge[]>,
  farEnd: 'src' | 'dst',
  other: NodeId[]
): Map<NodeId, number[]> {
  const otherIndex = buildLayerIndex(other);
  const positions = new Map<NodeId, number[]>(layer.map((id) => [id, []]));
  for (const [id, list] of positions) {
    for (const e of edgesOf.get(id) ?? []) {
      const position = otherIndex.get(e[farEnd]);
      if (position !== undefined) {
        list.push(position);
      }
    }
    list.sort((a, b) => a - b);
  }
  return positions;
}

/**
 * Adjacent swaps within a layer while one lowers the crossings with the layers on both sides.
 * Swapping two neighbours changes only the crossings between their own edges, so a swap is
 * scored by those (`crossingsOfNeighbours`).
 */
function transposeImprove(
  upper: NodeId[],
  current: NodeId[],
  edges: EdgesAtNodes,
  next?: NodeId[],
  topLaneOf?: (id: NodeId) => string | null
): NodeId[] {
  const best = [...current];
  const above = farEndPositions(current, edges.entering, 'src', upper);
  const below = farEndPositions(current, edges.leaving, 'dst', next ?? []);
  /** The crossings between the edges of `a` and `b` while `a` is left of `b`. */
  const crossingsWhileLeft = (a: NodeId, b: NodeId): number =>
    crossingsOfNeighbours(above.get(a)!, above.get(b)!) +
    crossingsOfNeighbours(below.get(a)!, below.get(b)!);

  const laneOf = lanesOf(current, topLaneOf);
  let improved = true;
  while (improved) {
    improved = swapPass(best, laneOf, crossingsWhileLeft);
  }
  return best;
}

/** Each node's top lane, for the same-lane check; null when there are no lanes to keep. */
function lanesOf(
  nodes: NodeId[],
  topLaneOf?: (id: NodeId) => string | null
): Map<NodeId, string | null> | null {
  return topLaneOf ? new Map(nodes.map((id) => [id, topLaneOf(id)])) : null;
}

/**
 * One pass of adjacent swaps over `order`, in place: a swap is made where it lowers the
 * crossings, between neighbours of the same lane (or both null-lane). Whether any was made.
 */
function swapPass(
  order: NodeId[],
  laneOf: Map<NodeId, string | null> | null,
  crossingsWhileLeft: (a: NodeId, b: NodeId) => number
): boolean {
  let improved = false;
  for (let i = 0; i + 1 < order.length; i++) {
    const a = order[i]!;
    const b = order[i + 1]!;
    if (laneOf && laneOf.get(a) !== laneOf.get(b)) {
      continue; // never swap across lane boundaries
    }
    if (crossingsWhileLeft(b, a) < crossingsWhileLeft(a, b)) {
      [order[i], order[i + 1]] = [b, a];
      improved = true;
    }
  }
  return improved;
}

// Sugiyama phase 3: lane-aware median sweeps plus adjacent transpose improvements.
export interface OrderOptions {
  laneOrder?: string[];
}

export function orderLayers(
  layering: Layering,
  gWithDummies: Graph,
  opts?: OrderOptions
): OrderedLayers {
  // Start with deterministic initial order per layer (preserve given order)
  const layers = layering.layers.map((l) => [...l]);
  const edges = edgesAtNodes(gWithDummies.edges);

  // Compute lane order for lane-aware crossing minimization (Siebenhaller Lemma 4.4)
  const topLaneOf = createTopLaneResolver(gWithDummies);
  const laneOrder = resolveTopLaneOrder(gWithDummies, opts?.laneOrder);

  // Perform top-down / bottom-up sweeps
  for (let s = 0; s < 3; s++) {
    // Top-down: reorder layer i based on neighbors in layer i-1
    for (let i = 1; i < layers.length; i++) {
      layers[i] = reorderLayer(layers[i - 1]!, layers[i]!, edges, 'down', topLaneOf, laneOrder);
      layers[i] = transposeImprove(layers[i - 1]!, layers[i]!, edges, layers[i + 1], topLaneOf);
    }
    // Bottom-up: reorder layer i based on neighbors in layer i+1
    for (let i = layers.length - 2; i >= 0; i--) {
      layers[i] = reorderLayer(layers[i + 1]!, layers[i]!, edges, 'up', topLaneOf, laneOrder);
      layers[i] = transposeImprove(layers[i + 1]!, layers[i]!, edges, layers[i - 1], topLaneOf);
    }
  }

  return { layers };
}
