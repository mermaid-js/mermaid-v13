// Ported from v12 `swimlanes/direction/sharedTrackNudging.ts` at upstream `c9b12739f` (D532).
// Changed: types tightened for `noUncheckedIndexedAccess`; v12 `Edge`/`Node` are the engine's
// `layoutData.ts` types.
/* eslint-disable max-depth, max-lines-per-function -- v12's file kept whole so upstream fixes port by hand (D532) */
import type { Edge, Node } from '../layoutData.ts';
import {
  collectNodeRectEntries,
  dedupeConsecutivePoints,
  overlapLength,
  orthogonalSegmentsForPoints,
  rectOfNodeBounds,
} from './geometry.ts';
import type { Point } from '../../types.ts';
import type { OrthogonalSegment } from './geometry.ts';
import {
  buildRectHitIndex,
  buildSegmentCrossingIndex,
  buildSegmentLineIndex,
  countSegmentCrossings,
} from './crossingIndex.ts';
import type { SegmentCrossingIndex, SegmentLineIndex } from './crossingIndex.ts';

export function nudgeSharedInteriorSubpaths(edges: Edge[], nodeByIdMap: Map<string, Node>): void {
  const EPS_LOCAL = 1e-3;
  const MIN_SHARED = 8;
  const TRACK_SHIFT = 7;
  const MIN_TRACK_GAP = TRACK_SHIFT;
  const SOURCE_DETOUR_STUB = 20;
  const BUFFER = 2;
  const MAX_ITERATIONS = 12;

  type PointLite = Point;

  interface SegmentLite extends OrthogonalSegment {
    edge: Edge;
    interior: boolean;
  }

  const { realNodeRects, labelNodeRects: labelRects } = collectNodeRectEntries(
    nodeByIdMap.values()
  );

  const nodeHits = buildRectHitIndex(realNodeRects, BUFFER);
  const labelHits = buildRectHitIndex(labelRects, BUFFER);

  /**
   * v13 (#726): the segments of one round, indexed. No route moves before the round ends, so
   * a candidate is tested against the indexes instead of every other edge, and each segment's
   * candidates are tried once however many segments crowd it.
   */
  interface Round {
    /** Each segment's place in the round's list. */
    position: Map<SegmentLite, number>;
    byEdge: Map<Edge, SegmentLite[]>;
    lines: SegmentLineIndex<SegmentLite>;
    crossings: SegmentCrossingIndex;
    /** The first safe candidate of each segment tried so far, or null. */
    fixes: Map<SegmentLite, PointLite[] | null>;
  }
  let round: Round;

  const segmentsFor = (edge: Edge, points: PointLite[]): SegmentLite[] => {
    return orthogonalSegmentsForPoints(points, EPS_LOCAL).map((segment) => ({
      ...segment,
      edge,
      interior: segment.index >= 1 && segment.index <= points.length - 3,
    }));
  };

  const allSegments = (): SegmentLite[] => {
    const result: SegmentLite[] = [];
    for (const edge of edges) {
      if (edge.isLayoutOnly) {
        continue;
      }
      const points = edge.points;
      if (!points || points.length < 2) {
        continue;
      }
      result.push(...segmentsFor(edge, dedupeConsecutivePoints(points)));
    }
    return result;
  };

  const hasCrowdedParallelTrack = (a: SegmentLite, b: SegmentLite): boolean => {
    if (a.horizontal && b.horizontal) {
      return (
        overlapLength(a.a.x, a.b.x, b.a.x, b.b.x) >= MIN_SHARED &&
        Math.abs(a.a.y - b.a.y) < MIN_TRACK_GAP
      );
    }
    if (a.vertical && b.vertical) {
      return (
        overlapLength(a.a.y, a.b.y, b.a.y, b.b.y) >= MIN_SHARED &&
        Math.abs(a.a.x - b.a.x) < MIN_TRACK_GAP
      );
    }
    return false;
  };

  const candidateIsSafe = (edge: Edge, candidate: PointLite[]): boolean => {
    const sourceId = edge.start;
    const targetId = edge.end;
    const candidateSegments = segmentsFor(edge, candidate);
    if (candidateSegments.length !== candidate.length - 1) {
      return false;
    }

    const endpointIds = [sourceId, targetId].filter((id): id is string => Boolean(id));
    const ownLabelIds = edge.labelNodeId ? [edge.labelNodeId] : [];
    for (const segment of candidateSegments) {
      if (nodeHits.hits(segment.a, segment.b, endpointIds)) {
        return false;
      }
      if (labelHits.hits(segment.a, segment.b, ownLabelIds)) {
        return false;
      }
    }

    for (const candidateSegment of candidateSegments) {
      for (const other of round.lines.sameAxisNear(candidateSegment, MIN_TRACK_GAP + 1)) {
        if (other.owner.edge !== edge && hasCrowdedParallelTrack(candidateSegment, other.owner)) {
          return false;
        }
      }
    }

    // No crossing with another edge: those with all the round's segments, less its own.
    return (
      round.crossings.count(candidateSegments) ===
      countSegmentCrossings(candidateSegments, round.byEdge.get(edge) ?? [], EPS_LOCAL)
    );
  };

  const shiftedCandidate = (segment: SegmentLite, shift: number): PointLite[] | undefined => {
    const points = dedupeConsecutivePoints(segment.edge.points ?? []);
    if (points.length < 4 || segment.index >= points.length - 1) {
      return undefined;
    }
    const candidate = points.map((p) => ({ ...p }));
    if (segment.horizontal) {
      candidate[segment.index]!.y += shift;
      candidate[segment.index + 1]!.y += shift;
    } else if (segment.vertical) {
      candidate[segment.index]!.x += shift;
      candidate[segment.index + 1]!.x += shift;
    } else {
      return undefined;
    }
    return segmentsFor(segment.edge, candidate).length === candidate.length - 1
      ? candidate
      : undefined;
  };

  type NodeRect = NonNullable<ReturnType<typeof rectOfNodeBounds>>;

  interface SourceDetourContext {
    sourceCenter: Point;
    targetCenter: Point;
    sourceRect: NodeRect;
    tail: PointLite[];
  }

  const nodeCenter = (node: Node, rect: NodeRect): Point => ({
    x: node.x ?? (rect.left + rect.right) / 2,
    y: node.y ?? (rect.top + rect.bottom) / 2,
  });

  const sourceDetourContextFor = (segment: SegmentLite): SourceDetourContext | undefined => {
    const edge = segment.edge;
    const points = dedupeConsecutivePoints(edge.points ?? []);
    if (points.length !== 4 || segment.index !== 1) {
      return undefined;
    }

    const sourceNode = edge.start ? nodeByIdMap.get(edge.start) : undefined;
    const targetNode = edge.end ? nodeByIdMap.get(edge.end) : undefined;
    const sourceRect = sourceNode ? rectOfNodeBounds(sourceNode) : undefined;
    const targetRect = targetNode ? rectOfNodeBounds(targetNode) : undefined;
    const tail = points.slice(segment.index + 2);
    if (!sourceNode || !targetNode || !sourceRect || !targetRect || tail.length === 0) {
      return undefined;
    }

    return {
      sourceCenter: nodeCenter(sourceNode, sourceRect),
      targetCenter: nodeCenter(targetNode, targetRect),
      sourceRect,
      tail,
    };
  };

  const verticalSourceDetour = (
    segment: SegmentLite,
    shift: number,
    sourceCenter: Point,
    targetCenter: Point,
    sourceRect: NodeRect,
    tail: PointLite[]
  ): PointLite[] | undefined => {
    const targetBelow = targetCenter.y >= sourceCenter.y;
    const sourcePortY = targetBelow ? sourceRect.bottom : sourceRect.top;
    const stubY = sourcePortY + (targetBelow ? SOURCE_DETOUR_STUB : -SOURCE_DETOUR_STUB);
    if (
      (targetBelow && segment.b.y <= stubY + EPS_LOCAL) ||
      (!targetBelow && segment.b.y >= stubY - EPS_LOCAL)
    ) {
      return undefined;
    }

    const railX = segment.a.x + shift;
    return dedupeConsecutivePoints(
      [
        { x: sourceCenter.x, y: sourcePortY },
        { x: sourceCenter.x, y: stubY },
        { x: railX, y: stubY },
        { x: railX, y: segment.b.y },
        ...tail,
      ],
      EPS_LOCAL
    );
  };

  const horizontalSourceDetour = (
    segment: SegmentLite,
    shift: number,
    sourceCenter: Point,
    targetCenter: Point,
    sourceRect: NodeRect,
    tail: PointLite[]
  ): PointLite[] | undefined => {
    const targetRight = targetCenter.x >= sourceCenter.x;
    const sourcePortX = targetRight ? sourceRect.right : sourceRect.left;
    const stubX = sourcePortX + (targetRight ? SOURCE_DETOUR_STUB : -SOURCE_DETOUR_STUB);
    if (
      (targetRight && segment.b.x <= stubX + EPS_LOCAL) ||
      (!targetRight && segment.b.x >= stubX - EPS_LOCAL)
    ) {
      return undefined;
    }

    const railY = segment.a.y + shift;
    return dedupeConsecutivePoints(
      [
        { x: sourcePortX, y: sourceCenter.y },
        { x: stubX, y: sourceCenter.y },
        { x: stubX, y: railY },
        { x: segment.b.x, y: railY },
        ...tail,
      ],
      EPS_LOCAL
    );
  };

  const sourceDetourCandidate = (segment: SegmentLite, shift: number): PointLite[] | undefined => {
    const context = sourceDetourContextFor(segment);
    if (!context) {
      return undefined;
    }

    if (segment.vertical) {
      return verticalSourceDetour(
        segment,
        shift,
        context.sourceCenter,
        context.targetCenter,
        context.sourceRect,
        context.tail
      );
    }
    if (segment.horizontal) {
      return horizontalSourceDetour(
        segment,
        shift,
        context.sourceCenter,
        context.targetCenter,
        context.sourceRect,
        context.tail
      );
    }

    return undefined;
  };

  const shifts = [
    -TRACK_SHIFT,
    TRACK_SHIFT,
    -2 * TRACK_SHIFT,
    2 * TRACK_SHIFT,
    -3 * TRACK_SHIFT,
    3 * TRACK_SHIFT,
  ];

  const startRound = (segments: SegmentLite[]): Round => {
    const byEdge = new Map<Edge, SegmentLite[]>();
    for (const segment of segments) {
      const own = byEdge.get(segment.edge) ?? [];
      own.push(segment);
      byEdge.set(segment.edge, own);
    }
    return {
      position: new Map(segments.map((segment, index) => [segment, index] as const)),
      byEdge,
      lines: buildSegmentLineIndex(segments.map((segment) => ({ owner: segment, segment }))),
      crossings: buildSegmentCrossingIndex(segments, EPS_LOCAL),
      fixes: new Map(),
    };
  };

  /** The first of the segment's candidates that is safe: by shift, the direct one first. */
  const fixFor = (segment: SegmentLite): PointLite[] | null => {
    let fix = round.fixes.get(segment);
    if (fix === undefined) {
      fix = null;
      for (const shift of shifts) {
        const direct = shiftedCandidate(segment, shift);
        if (direct && candidateIsSafe(segment.edge, direct)) {
          fix = direct;
          break;
        }

        const detoured = sourceDetourCandidate(segment, shift);
        if (detoured && candidateIsSafe(segment.edge, detoured)) {
          fix = detoured;
          break;
        }
      }
      round.fixes.set(segment, fix);
    }
    return fix;
  };

  /** The later segments of other edges that crowd `first`, in the order of the round's list. */
  const crowdingAfter = (first: SegmentLite): SegmentLite[] => {
    const from = round.position.get(first) ?? 0;
    const place = (segment: SegmentLite): number => round.position.get(segment) ?? 0;
    return [...round.lines.sameAxisNear(first, MIN_TRACK_GAP + 1)]
      .map((entry) => entry.owner)
      .filter(
        (second) =>
          place(second) > from &&
          second.edge !== first.edge &&
          hasCrowdedParallelTrack(first, second)
      )
      .sort((a, b) => place(a) - place(b));
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const segments = allSegments();
    round = startRound(segments);
    let fixed = false;

    for (let i = 0; i < segments.length && !fixed; i++) {
      const first = segments[i]!;
      for (const second of crowdingAfter(first)) {
        const candidates = [first, second].filter((segment) => segment.interior);
        for (const segment of candidates) {
          const fix = fixFor(segment);
          if (fix) {
            segment.edge.points = fix;
            fixed = true;
            break;
          }
        }
        if (fixed) {
          break;
        }
      }
    }

    if (!fixed) {
      return;
    }
  }
}
