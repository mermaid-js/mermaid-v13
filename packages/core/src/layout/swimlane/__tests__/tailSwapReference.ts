// The terminal tail swap as it was before it read the round's routes from indexes (#843): each
// candidate swap recounts the crossings of all pairs of edges and walks every edge for a shared
// track. Kept in plain form as the reference `tailSwap.differential.spec.ts` compares the pass
// with; the engine does not use it.
import {
  collectNodeRectEntries,
  countOrthogonalBends,
  dedupeConsecutivePoints,
  isHorizontalSegment,
  isVerticalSegment,
  orthogonalSegmentsForPoints,
  orthogonalSegmentsStrictlyCross,
  sameAxisSegmentOverlapLength,
  segmentHitsAnyRect,
  simplifyPolyline,
} from '../direction/geometry.ts';
import type { Point } from '../../types.ts';
import type { RectEntry } from '../direction/geometry.ts';
import type { Edge, Node } from '../layoutData.ts';

const EPS = 1e-3;
const MIN_SHARED = 8;
const BUFFER = 2;
const MAX_ITERATIONS = 4;
const SHARED_TRACK_TOLERANCE = 0.5;

export type RefEdge = Edge & { points?: Point[] };
type Replacements = Map<RefEdge, Point[]>;
interface Tail {
  tailStart: Point;
  terminal: Point;
}

const pointsOf = (edge: RefEdge, replacements: Replacements = new Map()): Point[] =>
  dedupeConsecutivePoints(replacements.get(edge) ?? edge.points ?? []);

function crossingsBetween(first: Point[], second: Point[]): number {
  let count = 0;
  for (const a of orthogonalSegmentsForPoints(first)) {
    for (const b of orthogonalSegmentsForPoints(second)) {
      if (orthogonalSegmentsStrictlyCross(a.a, a.b, b.a, b.b, EPS)) count++;
    }
  }
  return count;
}

function crossingCount(edges: RefEdge[], replacements: Replacements = new Map()): number {
  let count = 0;
  for (const [i, first] of edges.entries()) {
    for (const second of edges.slice(i + 1)) {
      count += crossingsBetween(pointsOf(first, replacements), pointsOf(second, replacements));
    }
  }
  return count;
}

const totalBends = (edges: RefEdge[], replacements: Replacements = new Map()): number =>
  edges.reduce((sum, edge) => sum + countOrthogonalBends(pointsOf(edge, replacements)), 0);

function tailOf(edge: RefEdge): Tail | undefined {
  const points = pointsOf(edge);
  if (points.length < 4) return undefined;
  const tailStart = points[points.length - 2]!;
  const terminal = points[points.length - 1]!;
  const straight =
    isHorizontalSegment(tailStart, terminal, EPS) || isVerticalSegment(tailStart, terminal, EPS);
  return straight ? { tailStart, terminal } : undefined;
}

function withTail(edge: RefEdge, tail: Tail): Point[] | undefined {
  const points = pointsOf(edge);
  if (points.length < 3) return undefined;
  const start = points[0]!;
  const firstTurn = points[1]!;
  let connector: Point;
  if (isHorizontalSegment(start, firstTurn, EPS)) {
    connector = { x: firstTurn.x, y: tail.tailStart.y };
  } else if (isVerticalSegment(start, firstTurn, EPS)) {
    connector = { x: tail.tailStart.x, y: firstTurn.y };
  } else {
    return undefined;
  }
  const candidate = simplifyPolyline(
    dedupeConsecutivePoints([start, firstTurn, connector, tail.tailStart, tail.terminal])
  );
  return orthogonalSegmentsForPoints(candidate).length === candidate.length - 1
    ? candidate
    : undefined;
}

/** A leg other than the last may not touch the destination's box; none may touch another box. */
function hitsNode(edge: RefEdge, path: Point[], rects: RectEntry[]): boolean {
  const endpointIds = [edge.start, edge.end].filter((id): id is string => Boolean(id));
  const destination = rects.filter((entry) => entry.id === edge.end);
  const segments = orthogonalSegmentsForPoints(path);
  return segments.some(
    (segment, index) =>
      segmentHitsAnyRect(segment.a, segment.b, rects, endpointIds, -BUFFER) ||
      (index < segments.length - 1 &&
        segmentHitsAnyRect(segment.a, segment.b, destination, [], -BUFFER))
  );
}

function sharesTrack(edges: RefEdge[], edge: RefEdge, path: Point[], rep: Replacements): boolean {
  const own = orthogonalSegmentsForPoints(path);
  return edges
    .filter((other) => other !== edge)
    .some((other) =>
      orthogonalSegmentsForPoints(pointsOf(other, rep)).some((theirs) =>
        own.some(
          (mine) => sameAxisSegmentOverlapLength(mine, theirs, SHARED_TRACK_TOLERANCE) >= MIN_SHARED
        )
      )
    );
}

function edgesByDestination(edges: RefEdge[], nodes: Map<string, Node>): RefEdge[][] {
  const buckets = new Map<string, RefEdge[]>();
  for (const edge of edges) {
    if (!edge.end || !nodes.has(edge.end) || pointsOf(edge).length < 4) continue;
    buckets.set(edge.end, [...(buckets.get(edge.end) ?? []), edge]);
  }
  return [...buckets.values()];
}

/** The swap of the two edges' tails, if both swapped routes are safe. */
function swapOf(
  edges: RefEdge[],
  rects: RectEntry[],
  first: RefEdge,
  second: RefEdge
): Replacements | undefined {
  const firstTail = tailOf(first);
  const secondTail = tailOf(second);
  if (!firstTail || !secondTail) return undefined;
  const firstPath = withTail(first, secondTail);
  const secondPath = withTail(second, firstTail);
  if (!firstPath || !secondPath) return undefined;
  const replacements: Replacements = new Map([
    [first, firstPath],
    [second, secondPath],
  ]);
  const unsafe = [first, second].some((edge) => {
    const path = replacements.get(edge)!;
    return hitsNode(edge, path, rects) || sharesTrack(edges, edge, path, replacements);
  });
  return unsafe ? undefined : replacements;
}

interface Scored {
  replacements: Replacements;
  crossings: number;
  bends: number;
}

/** Every pair of edges into one node. */
const destinationPairs = (edges: RefEdge[], nodes: Map<string, Node>): [RefEdge, RefEdge][] =>
  edgesByDestination(edges, nodes).flatMap((group) =>
    group.flatMap((first, i) =>
      group.slice(i + 1).map((second): [RefEdge, RefEdge] => [first, second])
    )
  );

/** Fewer crossings than `best`, or as many with fewer bends. */
const beats = (candidate: Scored, best: { crossings: number; bends: number }): boolean =>
  candidate.crossings < best.crossings ||
  (candidate.crossings === best.crossings && candidate.bends < best.bends);

function bestSwap(edges: RefEdge[], nodes: Map<string, Node>, current: number): Scored | undefined {
  const { realNodeRects } = collectNodeRectEntries(nodes.values());
  let best: { crossings: number; bends: number } = { crossings: current, bends: totalBends(edges) };
  let found: Scored | undefined;
  for (const [first, second] of destinationPairs(edges, nodes)) {
    const replacements = swapOf(edges, realNodeRects, first, second);
    if (!replacements) continue;
    const candidate = {
      replacements,
      crossings: crossingCount(edges, replacements),
      bends: totalBends(edges, replacements),
    };
    if (candidate.crossings < current && beats(candidate, best)) {
      best = candidate;
      found = candidate;
    }
  }
  return found;
}

export function swapDestinationTerminalTailsReference(
  allEdges: RefEdge[],
  nodes: Map<string, Node>
): void {
  const edges = allEdges.filter((edge) => !edge.isLayoutOnly);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const current = crossingCount(edges);
    const best = current === 0 ? undefined : bestSwap(edges, nodes, current);
    if (!best) return;
    for (const [edge, points] of best.replacements) edge.points = points;
  }
}
