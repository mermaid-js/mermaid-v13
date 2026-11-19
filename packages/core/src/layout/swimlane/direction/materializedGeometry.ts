// Ported from v12 `swimlanes/direction/materializedGeometry.ts` at upstream `c9b12739f` (D532).
// Changed: the title-band passes follow D536 (BT lifts a top band, RL shifts a left band); types
// tightened for `noUncheckedIndexedAccess`; v12 `Edge`/`Node` are the engine's `layoutData.ts` types;
// the tail swap keeps legs off the destination's box (#636); `liftRailsOffForeignEdgeLabels` (#634);
// the crossing cleanup keeps an edge whose ends share a lane inside it (#683).
/* eslint-disable complexity, max-depth, max-lines, max-lines-per-function, no-nested-ternary, sonarjs/no-identical-functions -- v12's file kept whole so upstream fixes port by hand (D532) */
// cspell:ignore Wybrow sonarjs

import {
  bendPoints,
  collectNodeRectEntries,
  countOrthogonalBends,
  dedupeConsecutivePoints,
  isHorizontalSegment,
  isVerticalSegment,
  samePoint,
  sameX,
  sameY,
  buildOrthogonalPortPath,
  buildSameSideTrackPath,
  overlapLength,
  orthogonalSegmentsForPoints,
  orthogonalSegmentsStrictlyCross,
  portForRectSide,
  rectOfNodeBounds,
  sameAxisSegmentOverlapLength,
  segmentBoundsOverlapRect,
  segmentHitsAnyRect,
  simplifyPolyline,
} from './geometry.ts';
import type { OrthogonalSegment, Point, RectBounds, RectSide } from './geometry.ts';
import type { Edge, Node } from '../layoutData.ts';
import {
  buildRectHitIndex,
  buildSegmentCrossingIndex,
  buildSegmentLineIndex,
  buildTrackConflictIndex,
  countCrossingsPerRoute,
  countCrossingsWithOthersUpTo,
  countSegmentCrossings,
  shapesTouchAtBend,
} from './crossingIndex.ts';
import type {
  RouteShape,
  SegmentCrossingIndex,
  SegmentLineIndex,
  TrackConflictIndex,
} from './crossingIndex.ts';
import { EDGE_ROUTING } from '../config.ts';
import { buildLaneModel } from '../lanes.ts';
import {
  crossingPointsBetween,
  hopsStayInsideBand,
  sharedLaneBand,
  staysInsideBand,
} from './laneContainment.ts';

const EPS_LOCAL = 1e-3;
const MIN_SHARED = 8;

const upperCaseDirection = (raw: unknown): string =>
  typeof raw === 'string' ? raw.toUpperCase() : '';

type PointLite = Point;
type RectLite = RectBounds;
type MaterializedEdge = Edge & { points?: PointLite[] };
type MaterializedNode = Node & { direction?: string };
type EdgeReplacementMap = Map<MaterializedEdge, PointLite[]>;

type SegmentLite = OrthogonalSegment;

const segmentsFor = orthogonalSegmentsForPoints;

const orthogonallyAligned = (a: PointLite, b: PointLite): boolean =>
  sameX(a, b, EPS_LOCAL) || sameY(a, b, EPS_LOCAL);

export function separateSharedRenderedTerminalLanes(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const MIN_FACE_CLEARANCE = 16;
  const TRACK_SHIFT = 7;

  interface TerminalLane {
    edge: MaterializedEdge;
    edgeId: string;
    nodeId: string;
    atStart: boolean;
    orientation: 'H' | 'V';
    coord: number;
    min: number;
    max: number;
    boundary: PointLite;
    railEnd: PointLite;
    rect: RectLite;
  }

  const rectIntersect = (node: MaterializedNode, point: PointLite): PointLite => {
    const x = (node as { x?: number }).x ?? 0;
    const y = (node as { y?: number }).y ?? 0;
    const dx = point.x - x;
    const dy = point.y - y;
    let w = ((node as { width?: number }).width ?? 0) / 2;
    let h = ((node as { height?: number }).height ?? 0) / 2;

    if (Math.abs(dy) * w > Math.abs(dx) * h) {
      if (dy < 0) {
        h = -h;
      }
      return { x: x + (dy === 0 ? 0 : (h * dx) / dy), y: y + h };
    }

    if (dx < 0) {
      w = -w;
    }
    return { x: x + w, y: y + (dx === 0 ? 0 : (w * dy) / dx) };
  };

  const terminalLaneFor = (edge: MaterializedEdge, atStart: boolean): TerminalLane | undefined => {
    const points = dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? []);
    if (points.length < 2) {
      return undefined;
    }

    const nodeId = atStart ? (edge as { start?: string }).start : (edge as { end?: string }).end;
    const node = nodeId ? nodeByIdMap.get(nodeId) : undefined;
    const rect = node ? rectOfNodeBounds(node) : undefined;
    if (!node || !nodeId || !rect) {
      return undefined;
    }

    const endpoint = atStart ? points[0]! : points[points.length - 1]!;
    const adjacent = atStart ? points[1]! : points[points.length - 2]!;
    const boundary = rectIntersect(node, endpoint);
    let railEnd = endpoint;
    if (orthogonallyAligned(adjacent, boundary)) {
      railEnd = adjacent;
    }

    if (sameX(boundary, railEnd, EPS_LOCAL)) {
      return {
        edge,
        edgeId: String((edge as { id?: string }).id ?? ''),
        nodeId,
        atStart,
        orientation: 'V',
        coord: boundary.x,
        min: Math.min(boundary.y, railEnd.y),
        max: Math.max(boundary.y, railEnd.y),
        boundary,
        railEnd,
        rect,
      };
    }
    if (sameY(boundary, railEnd, EPS_LOCAL)) {
      return {
        edge,
        edgeId: String((edge as { id?: string }).id ?? ''),
        nodeId,
        atStart,
        orientation: 'H',
        coord: boundary.y,
        min: Math.min(boundary.x, railEnd.x),
        max: Math.max(boundary.x, railEnd.x),
        boundary,
        railEnd,
        rect,
      };
    }
    return undefined;
  };

  const projectedOverlapLength = (a: TerminalLane, b: TerminalLane): number =>
    Math.max(0, Math.min(a.max, b.max) - Math.max(a.min, b.min));

  const sameTerminalFace = (a: TerminalLane, b: TerminalLane): boolean => {
    if (a.nodeId !== b.nodeId || a.orientation !== b.orientation) {
      return false;
    }

    if (a.orientation === 'H') {
      const aOnHorizontalFace =
        Math.abs(a.boundary.x - a.rect.left) < 1 || Math.abs(a.boundary.x - a.rect.right) < 1;
      return aOnHorizontalFace && sameX(a.boundary, b.boundary, 1);
    }

    const aOnVerticalFace =
      Math.abs(a.boundary.y - a.rect.top) < 1 || Math.abs(a.boundary.y - a.rect.bottom) < 1;
    return aOnVerticalFace && sameY(a.boundary, b.boundary, 1);
  };

  const exactTerminalLaneConflict = (a: TerminalLane, b: TerminalLane): boolean => {
    if (a.nodeId !== b.nodeId || a.orientation !== b.orientation) {
      return false;
    }

    const shared = projectedOverlapLength(a, b);
    return shared >= MIN_SHARED && Math.abs(a.coord - b.coord) < 0.5;
  };

  const nearTerminalLaneConflict = (a: TerminalLane, b: TerminalLane): boolean => {
    if (
      a.nodeId !== b.nodeId ||
      a.orientation !== b.orientation ||
      a.orientation !== 'H' ||
      a.atStart === b.atStart
    ) {
      return false;
    }

    const shared = projectedOverlapLength(a, b);
    if (shared < MIN_SHARED) {
      return false;
    }
    const faceSpan = a.rect.bottom - a.rect.top;
    if (shared < faceSpan || shared > 2 * faceSpan) {
      return false;
    }

    // Wybrow-style nudging keeps connector topology fixed while preserving
    // ordering constraints; rendered terminal tracks on the same object face
    // need the same treatment before endpoint duplication pins them in place.
    return sameTerminalFace(a, b) && Math.abs(a.coord - b.coord) < MIN_FACE_CLEARANCE;
  };

  const shiftedCandidate = (lane: TerminalLane, shift: number): PointLite[] | undefined => {
    const points = dedupeConsecutivePoints((lane.edge as { points?: PointLite[] }).points ?? []);
    if (points.length < 2) {
      return undefined;
    }

    const shiftedBoundary =
      lane.orientation === 'V'
        ? { x: lane.boundary.x + shift, y: lane.boundary.y }
        : { x: lane.boundary.x, y: lane.boundary.y + shift };
    const shiftedRailEnd =
      lane.orientation === 'V'
        ? { x: lane.railEnd.x + shift, y: lane.railEnd.y }
        : { x: lane.railEnd.x, y: lane.railEnd.y + shift };

    const boundaryStaysOnSameFace = (): boolean => {
      if (
        Math.abs(lane.boundary.y - lane.rect.top) < 1 ||
        Math.abs(lane.boundary.y - lane.rect.bottom) < 1
      ) {
        return (
          sameY(shiftedBoundary, lane.boundary, EPS_LOCAL) &&
          shiftedBoundary.x >= lane.rect.left + 1 &&
          shiftedBoundary.x <= lane.rect.right - 1
        );
      }

      if (
        Math.abs(lane.boundary.x - lane.rect.left) < 1 ||
        Math.abs(lane.boundary.x - lane.rect.right) < 1
      ) {
        return (
          sameX(shiftedBoundary, lane.boundary, EPS_LOCAL) &&
          shiftedBoundary.y >= lane.rect.top + 1 &&
          shiftedBoundary.y <= lane.rect.bottom - 1
        );
      }

      return false;
    };

    if (!boundaryStaysOnSameFace()) {
      return undefined;
    }

    if (lane.atStart) {
      const railEndIsAdjacent = points.length > 1 && samePoint(points[1]!, lane.railEnd, EPS_LOCAL);
      const rest = points.slice(railEndIsAdjacent ? 2 : 1);
      const next = rest[0];
      if (next && !orthogonallyAligned(next, shiftedRailEnd)) {
        return undefined;
      }
      return [shiftedBoundary, shiftedRailEnd, ...rest];
    }

    const railEndIsAdjacent =
      points.length > 1 && samePoint(points[points.length - 2]!, lane.railEnd, EPS_LOCAL);
    const before = points.slice(0, railEndIsAdjacent ? -2 : -1);
    const previous = before[before.length - 1];
    if (previous && !orthogonallyAligned(previous, shiftedRailEnd)) {
      return undefined;
    }
    return [...before, shiftedRailEnd, shiftedBoundary];
  };

  const laneIsStraightCollinearConnector = (lane: TerminalLane): boolean => {
    const edge = lane.edge as { points?: PointLite[]; start?: string; end?: string };
    const points = dedupeConsecutivePoints(edge.points ?? []);
    if (points.length !== 2) {
      return false;
    }
    const startId = edge.start;
    const endId = edge.end;
    const start = startId ? nodeByIdMap.get(startId) : undefined;
    const end = endId ? nodeByIdMap.get(endId) : undefined;
    if (!start || !end) {
      return false;
    }

    const startX = (start as { x?: number }).x ?? 0;
    const startY = (start as { y?: number }).y ?? 0;
    const endX = (end as { x?: number }).x ?? 0;
    const endY = (end as { y?: number }).y ?? 0;
    const [a, b] = points as [Point, Point];

    return (
      (sameY(a, b, EPS_LOCAL) && Math.abs(startY - endY) < 1 && Math.abs(startX - endX) > 1) ||
      (sameX(a, b, EPS_LOCAL) && Math.abs(startX - endX) < 1 && Math.abs(startY - endY) > 1)
    );
  };

  const shifts = [
    -TRACK_SHIFT,
    TRACK_SHIFT,
    -2 * TRACK_SHIFT,
    2 * TRACK_SHIFT,
    -3 * TRACK_SHIFT,
    3 * TRACK_SHIFT,
  ];

  for (let iteration = 0; iteration < 8; iteration++) {
    const lanes = edges
      .flatMap((edge) =>
        (edge as { isLayoutOnly?: boolean }).isLayoutOnly
          ? []
          : [terminalLaneFor(edge, true), terminalLaneFor(edge, false)]
      )
      .filter((lane): lane is TerminalLane => Boolean(lane));

    let fixed = false;
    for (let i = 0; i < lanes.length && !fixed; i++) {
      for (let j = i + 1; j < lanes.length && !fixed; j++) {
        const first = lanes[i]!;
        const second = lanes[j]!;
        if (
          first.edge === second.edge ||
          !(exactTerminalLaneConflict(first, second) || nearTerminalLaneConflict(first, second))
        ) {
          continue;
        }

        const fixingNearConflict = !exactTerminalLaneConflict(first, second);
        const candidates = [first, second].sort((a, b) => {
          const aPreservesStraight = laneIsStraightCollinearConnector(a);
          const bPreservesStraight = laneIsStraightCollinearConnector(b);
          if (aPreservesStraight !== bPreservesStraight) {
            return Number(aPreservesStraight) - Number(bPreservesStraight);
          }
          return Number(!b.atStart) - Number(!a.atStart);
        });
        for (const lane of candidates) {
          for (const shift of shifts) {
            const candidate = shiftedCandidate(lane, shift);
            if (!candidate) {
              continue;
            }
            const nextLane = terminalLaneFor({ ...lane.edge, points: candidate }, lane.atStart);
            if (
              !nextLane ||
              lanes.some(
                (other) =>
                  other.edge !== lane.edge &&
                  (exactTerminalLaneConflict(nextLane, other) ||
                    (fixingNearConflict && nearTerminalLaneConflict(nextLane, other)))
              )
            ) {
              continue;
            }

            (lane.edge as { points: PointLite[] }).points = candidate;
            fixed = true;
            break;
          }
          if (fixed) {
            break;
          }
        }
      }
    }

    if (!fixed) {
      return;
    }
  }
}

export function collapseRedundantRectangularDoglegs(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const MAX_ITERATIONS = 8;

  const { realNodeRects, labelNodeRects: labelRects } = collectNodeRectEntries(
    nodeByIdMap.values()
  );

  const candidateIsSafe = (edge: MaterializedEdge, candidate: PointLite[]): boolean => {
    const sourceId = (edge as { start?: string }).start;
    const targetId = (edge as { end?: string }).end;
    const candidateSegments = segmentsFor(candidate);
    if (candidateSegments.length !== candidate.length - 1) {
      return false;
    }

    const endpointIds = [sourceId, targetId].filter((id): id is string => Boolean(id));
    for (const segment of candidateSegments) {
      if (segmentHitsAnyRect(segment.a, segment.b, realNodeRects, endpointIds, -BUFFER)) {
        return false;
      }
      if (segmentHitsAnyRect(segment.a, segment.b, labelRects, [], -BUFFER)) {
        return false;
      }
    }

    for (const other of edges) {
      if (other === edge || (other as { isLayoutOnly?: boolean }).isLayoutOnly) {
        continue;
      }
      const otherPoints = (other as { points?: PointLite[] }).points;
      if (!otherPoints || otherPoints.length < 2) {
        continue;
      }
      for (const candidateSegment of candidateSegments) {
        for (const otherSegment of segmentsFor(dedupeConsecutivePoints(otherPoints))) {
          if (sameAxisSegmentOverlapLength(candidateSegment, otherSegment, 0.5) >= MIN_SHARED) {
            return false;
          }
          if (
            orthogonalSegmentsStrictlyCross(
              candidateSegment.a,
              candidateSegment.b,
              otherSegment.a,
              otherSegment.b,
              EPS_LOCAL
            )
          ) {
            return false;
          }
        }
      }
    }

    return true;
  };

  const withoutDogleg = (points: PointLite[], i: number): PointLite[] | undefined => {
    if (i + 4 >= points.length) {
      return undefined;
    }
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const p2 = points[i + 2]!;
    const p3 = points[i + 3]!;
    const p4 = points[i + 4]!;

    const terminalVerticalDogleg =
      isHorizontalSegment(p0, p1) &&
      isVerticalSegment(p1, p2) &&
      isHorizontalSegment(p2, p3) &&
      isVerticalSegment(p3, p4) &&
      sameX(p0, p3, EPS_LOCAL) &&
      sameX(p0, p4, EPS_LOCAL) &&
      sameX(p1, p2, EPS_LOCAL) &&
      (p1.x - p0.x) * (p3.x - p2.x) < 0;

    const terminalHorizontalDogleg =
      isVerticalSegment(p0, p1) &&
      isHorizontalSegment(p1, p2) &&
      isVerticalSegment(p2, p3) &&
      isHorizontalSegment(p3, p4) &&
      sameY(p0, p3, EPS_LOCAL) &&
      sameY(p0, p4, EPS_LOCAL) &&
      sameY(p1, p2, EPS_LOCAL) &&
      (p1.y - p0.y) * (p3.y - p2.y) < 0;

    if (terminalVerticalDogleg || terminalHorizontalDogleg) {
      return dedupeConsecutivePoints([...points.slice(0, i + 1), p4, ...points.slice(i + 5)]);
    }

    if (i + 5 >= points.length) {
      return undefined;
    }
    const p5 = points[i + 5]!;

    const verticalDogleg =
      isVerticalSegment(p0, p1) &&
      isHorizontalSegment(p1, p2) &&
      isVerticalSegment(p2, p3) &&
      isHorizontalSegment(p3, p4) &&
      isVerticalSegment(p4, p5) &&
      sameX(p0, p4, EPS_LOCAL) &&
      sameX(p0, p5, EPS_LOCAL) &&
      sameX(p2, p3, EPS_LOCAL) &&
      (p2.x - p1.x) * (p4.x - p3.x) < 0;

    const horizontalDogleg =
      isHorizontalSegment(p0, p1) &&
      isVerticalSegment(p1, p2) &&
      isHorizontalSegment(p2, p3) &&
      isVerticalSegment(p3, p4) &&
      isHorizontalSegment(p4, p5) &&
      sameY(p0, p4, EPS_LOCAL) &&
      sameY(p0, p5, EPS_LOCAL) &&
      sameY(p2, p3, EPS_LOCAL) &&
      (p2.y - p1.y) * (p4.y - p3.y) < 0;

    if (!verticalDogleg && !horizontalDogleg) {
      return undefined;
    }

    return dedupeConsecutivePoints([...points.slice(0, i + 1), p5, ...points.slice(i + 6)]);
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let fixed = false;
    for (const edge of edges) {
      if ((edge as { isLayoutOnly?: boolean }).isLayoutOnly) {
        continue;
      }
      const points = dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? []);
      for (let i = 0; i <= points.length - 5; i++) {
        const candidate = withoutDogleg(points, i);
        if (!candidate || !candidateIsSafe(edge, candidate)) {
          continue;
        }
        (edge as { points: PointLite[] }).points = candidate;
        fixed = true;
        break;
      }
      if (fixed) {
        break;
      }
    }
    if (!fixed) {
      return;
    }
  }
}

export function liftObstacleHuggingSameSideRails(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const CLEARANCE = 20;
  const MAX_ITERATIONS = 8;

  const { realNodeRects, labelNodeRects: labelRects } = collectNodeRectEntries(
    nodeByIdMap.values()
  );
  const visibleEdges = edges.filter((edge) => !(edge as { isLayoutOnly?: boolean }).isLayoutOnly);

  const pointsFor = (
    edge: MaterializedEdge,
    replacementEdge?: MaterializedEdge,
    replacement?: PointLite[]
  ): PointLite[] =>
    dedupeConsecutivePoints(
      edge === replacementEdge
        ? (replacement ?? [])
        : ((edge as { points?: PointLite[] }).points ?? [])
    );

  const strictCrossingCount = (
    replacementEdge?: MaterializedEdge,
    replacement?: PointLite[]
  ): number => {
    let count = 0;
    for (let i = 0; i < visibleEdges.length; i++) {
      const firstSegments = segmentsFor(pointsFor(visibleEdges[i]!, replacementEdge, replacement));
      for (let j = i + 1; j < visibleEdges.length; j++) {
        const secondSegments = segmentsFor(
          pointsFor(visibleEdges[j]!, replacementEdge, replacement)
        );
        for (const firstSegment of firstSegments) {
          for (const secondSegment of secondSegments) {
            if (
              orthogonalSegmentsStrictlyCross(
                firstSegment.a,
                firstSegment.b,
                secondSegment.a,
                secondSegment.b,
                EPS_LOCAL
              )
            ) {
              count++;
            }
          }
        }
      }
    }
    return count;
  };

  const middleRail = (
    points: PointLite[]
  ):
    | { index: number; horizontal: boolean; vertical: boolean; segment: SegmentLite }
    | undefined => {
    const segments = segmentsFor(points);
    if (segments.length !== 3) {
      return undefined;
    }
    const middle = segments[1]!;
    if (
      segments[0]!.horizontal === middle.horizontal ||
      segments[2]!.horizontal === middle.horizontal
    ) {
      return undefined;
    }
    return {
      index: middle.index,
      horizontal: middle.horizontal,
      vertical: middle.vertical,
      segment: middle,
    };
  };

  const blockingRectsFor = (edge: MaterializedEdge, rail: SegmentLite) => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    return realNodeRects.filter((entry) => {
      if (endpointIds.includes(entry.id)) {
        return false;
      }
      const rect = entry.rect;
      if (rail.horizontal) {
        const xOverlap = overlapLength(rail.a.x, rail.b.x, rect.left, rect.right);
        return (
          xOverlap >= MIN_SHARED &&
          rail.a.y >= rect.top - BUFFER &&
          rail.a.y <= rect.bottom + BUFFER
        );
      }
      const yOverlap = overlapLength(rail.a.y, rail.b.y, rect.top, rect.bottom);
      return (
        yOverlap >= MIN_SHARED && rail.a.x >= rect.left - BUFFER && rail.a.x <= rect.right + BUFFER
      );
    });
  };

  const candidateByMovingRail = (
    points: PointLite[],
    rail: SegmentLite,
    coord: number
  ): PointLite[] | undefined => {
    const candidate = points.map((point) => ({ ...point }));
    if (rail.horizontal) {
      candidate[rail.index]!.y = coord;
      candidate[rail.index + 1]!.y = coord;
    } else if (rail.vertical) {
      candidate[rail.index]!.x = coord;
      candidate[rail.index + 1]!.x = coord;
    } else {
      return undefined;
    }
    const simplified = simplifyPolyline(dedupeConsecutivePoints(candidate));
    return segmentsFor(simplified).length === simplified.length - 1 ? simplified : undefined;
  };

  const candidateIsSafe = (
    edge: MaterializedEdge,
    candidate: PointLite[],
    currentCrossings: number
  ): boolean => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    const candidateSegments = segmentsFor(candidate);
    if (candidateSegments.length !== candidate.length - 1) {
      return false;
    }

    for (const segment of candidateSegments) {
      if (segmentHitsAnyRect(segment.a, segment.b, realNodeRects, endpointIds, -BUFFER)) {
        return false;
      }
      if (segmentHitsAnyRect(segment.a, segment.b, labelRects, [], -BUFFER)) {
        return false;
      }
    }

    for (const other of visibleEdges) {
      if (other === edge) {
        continue;
      }
      for (const candidateSegment of candidateSegments) {
        for (const otherSegment of segmentsFor(pointsFor(other))) {
          if (sameAxisSegmentOverlapLength(candidateSegment, otherSegment, 0.5) >= MIN_SHARED) {
            return false;
          }
        }
      }
    }

    return strictCrossingCount(edge, candidate) <= currentCrossings;
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const currentCrossings = strictCrossingCount();
    let fixed = false;

    for (const edge of visibleEdges) {
      const points = pointsFor(edge);
      const rail = middleRail(points);
      if (!rail) {
        continue;
      }
      const blockers = blockingRectsFor(edge, rail.segment);
      if (blockers.length === 0) {
        continue;
      }

      const coords = rail.horizontal
        ? [
            Math.min(...blockers.map((entry) => entry.rect.top)) - CLEARANCE,
            Math.max(...blockers.map((entry) => entry.rect.bottom)) + CLEARANCE,
          ]
        : [
            Math.min(...blockers.map((entry) => entry.rect.left)) - CLEARANCE,
            Math.max(...blockers.map((entry) => entry.rect.right)) + CLEARANCE,
          ];

      for (const coord of coords) {
        const candidate = candidateByMovingRail(points, rail.segment, coord);
        if (!candidate || !candidateIsSafe(edge, candidate, currentCrossings)) {
          continue;
        }
        (edge as { points: PointLite[] }).points = candidate;
        fixed = true;
        break;
      }
      if (fixed) {
        break;
      }
    }

    if (!fixed) {
      return;
    }
  }
}

/**
 * v13 (#634): moves an interior rail that runs through or along another edge's label clear of
 * it. The router leaves labels out (they are anchored after routing), so a rail placed beside a
 * node can run along a label wider than that node. The rail moves to the label's nearer side,
 * `ROUTE_TOUCH_TOLERANCE` out (the least gap a reader sees between two strokes), only where that
 * hits no node or label, shares no track and adds no crossing. Moving a rail next to a short
 * terminal stub must not turn that stub back into its own box: each terminal leg keeps its
 * direction, and an end box is exempt only for its own terminal leg (as the tail swap, #636).
 */
export function liftRailsOffForeignEdgeLabels(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const CLEARANCE = EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE;

  const { realNodeRects, labelNodeRects } = collectNodeRectEntries(nodeByIdMap.values());
  if (labelNodeRects.length === 0) {
    return;
  }
  const visibleEdges = edges.filter((edge) => !edge.isLayoutOnly);
  const pointsFor = (edge: MaterializedEdge): PointLite[] =>
    dedupeConsecutivePoints(edge.points ?? []);
  // One segment list per edge, replaced only for the edge that moves.
  const segmentsByEdge = new Map(visibleEdges.map((edge) => [edge, segmentsFor(pointsFor(edge))]));
  const othersOf = (edge: MaterializedEdge): SegmentLite[][] =>
    visibleEdges.filter((other) => other !== edge).map((other) => segmentsByEdge.get(other)!);

  const crossingsOf = (own: SegmentLite[], others: SegmentLite[][]): number => {
    let count = 0;
    for (const segments of others) {
      for (const a of own) {
        for (const b of segments) {
          if (orthogonalSegmentsStrictlyCross(a.a, a.b, b.a, b.b, EPS_LOCAL)) {
            count++;
          }
        }
      }
    }
    return count;
  };

  const railHugsRect = (rail: SegmentLite, rect: RectLite): boolean =>
    rail.horizontal
      ? overlapLength(rail.a.x, rail.b.x, rect.left, rect.right) >= MIN_SHARED &&
        rail.a.y >= rect.top - BUFFER &&
        rail.a.y <= rect.bottom + BUFFER
      : overlapLength(rail.a.y, rail.b.y, rect.top, rect.bottom) >= MIN_SHARED &&
        rail.a.x >= rect.left - BUFFER &&
        rail.a.x <= rect.right + BUFFER;

  const step = (from: PointLite, to: PointLite): string => {
    const sign = (d: number): number => (Math.abs(d) < EPS_LOCAL ? 0 : Math.sign(d));
    return `${sign(to.x - from.x)},${sign(to.y - from.y)}`;
  };
  /** Whether the first and last legs of `candidate` still leave and enter as `points` do. */
  const keepsTerminalLegs = (points: PointLite[], candidate: PointLite[]): boolean =>
    step(points[0]!, points[1]!) === step(candidate[0]!, candidate[1]!) &&
    step(points.at(-2)!, points.at(-1)!) === step(candidate.at(-2)!, candidate.at(-1)!);

  const candidateIsSafe = (
    edge: MaterializedEdge,
    candidateSegments: SegmentLite[],
    others: SegmentLite[][]
  ): boolean => {
    const ownLabel = edge.labelNodeId ? [edge.labelNodeId] : [];
    const last = candidateSegments.length - 1;
    for (const [i, segment] of candidateSegments.entries()) {
      // An end box is exempt only for the leg that reaches it.
      const ends = [i === 0 && edge.start, i === last && edge.end].filter((id): id is string =>
        Boolean(id)
      );
      if (
        segmentHitsAnyRect(segment.a, segment.b, realNodeRects, ends, -BUFFER) ||
        segmentHitsAnyRect(segment.a, segment.b, labelNodeRects, ownLabel, -BUFFER)
      ) {
        return false;
      }
    }
    for (const segments of others) {
      for (const a of candidateSegments) {
        for (const b of segments) {
          if (sameAxisSegmentOverlapLength(a, b, 0.5) >= MIN_SHARED) {
            return false;
          }
        }
      }
    }
    return true;
  };

  // A fix leaves the edge clear of every foreign label, so each edge is fixed at most once; the
  // bound is the number of interior rails, which is at least that.
  let rails = 1;
  for (const segments of segmentsByEdge.values()) {
    rails += Math.max(0, segments.length - 2);
  }
  for (let iteration = 0; iteration < rails; iteration++) {
    let fixed = false;
    for (const edge of visibleEdges) {
      const points = pointsFor(edge);
      const segments = segmentsByEdge.get(edge)!;
      if (segments.length !== points.length - 1 || segments.length < 3) {
        continue;
      }
      for (const rail of segments.slice(1, -1)) {
        const label = labelNodeRects.find(
          (entry) => entry.id !== edge.labelNodeId && railHugsRect(rail, entry.rect)
        );
        if (!label) {
          continue;
        }
        const coord = rail.horizontal ? rail.a.y : rail.a.x;
        const [low, high] = rail.horizontal
          ? [label.rect.top, label.rect.bottom]
          : [label.rect.left, label.rect.right];
        const coords = [low - CLEARANCE, high + CLEARANCE].sort(
          (a, b) => Math.abs(a - coord) - Math.abs(b - coord)
        );
        const others = othersOf(edge);
        const crossings = crossingsOf(segments, others);
        for (const next of coords) {
          const moved = points.map((point) => ({ ...point }));
          for (const i of [rail.index, rail.index + 1]) {
            moved[i] = rail.horizontal ? { ...moved[i]!, y: next } : { ...moved[i]!, x: next };
          }
          const candidate = simplifyPolyline(dedupeConsecutivePoints(moved));
          const candidateSegments = segmentsFor(candidate);
          if (
            candidateSegments.length === candidate.length - 1 &&
            keepsTerminalLegs(points, candidate) &&
            candidateIsSafe(edge, candidateSegments, others) &&
            crossingsOf(candidateSegments, others) <= crossings
          ) {
            edge.points = candidate;
            segmentsByEdge.set(edge, candidateSegments);
            fixed = true;
            break;
          }
        }
        if (fixed) {
          break;
        }
      }
      if (fixed) {
        break;
      }
    }
    if (!fixed) {
      return;
    }
  }
}

/**
 * Moves top-lane title bands (TB, BT) above any rail that crosses them. A lane with no
 * `direction` of its own takes the layout's `direction`.
 */
export function liftTopLaneTitleBandsAboveRails(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>,
  layoutDirection?: string
): void {
  const CLEARANCE = 4;

  interface LaneTitle {
    node: MaterializedNode;
    rect: RectLite;
  }

  const validTitleRect = (node: MaterializedNode): RectLite | undefined => {
    const rect = (node as { groupTitleRect?: Partial<RectBounds> }).groupTitleRect;
    if (
      !rect ||
      typeof rect.left !== 'number' ||
      typeof rect.right !== 'number' ||
      typeof rect.top !== 'number' ||
      typeof rect.bottom !== 'number' ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.bottom) ||
      rect.right <= rect.left ||
      rect.bottom <= rect.top
    ) {
      return undefined;
    }
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  };

  const laneModel = buildLaneModel([...nodeByIdMap.values()]);

  const topLaneTitleFor = (node: MaterializedNode): LaneTitle | undefined => {
    if (!laneModel.isLane(node.id)) {
      return undefined;
    }
    const direction = upperCaseDirection(
      (node as { direction?: unknown }).direction ?? layoutDirection
    );
    // BT keeps its title band on top (D536), so it is lifted as TB's is.
    if (direction === 'LR' || direction === 'RL') {
      return undefined;
    }
    const rect = validTitleRect(node);
    const y = (node as { y?: number }).y;
    const height = (node as { height?: number }).height;
    if (
      !rect ||
      typeof y !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(y) ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      return undefined;
    }
    const titleWidth = rect.right - rect.left;
    const titleHeight = rect.bottom - rect.top;
    if (titleHeight <= 0 || titleWidth < titleHeight) {
      return undefined;
    }
    return { node, rect };
  };

  const horizontalSegmentIntersectsTitle = (segment: SegmentLite, rect: RectLite): boolean => {
    if (!segment.horizontal) {
      return false;
    }
    const y = segment.a.y;
    // A rail along the band's edge counts, as it does for validateLayout.
    if (y < rect.top - EPS_LOCAL || y > rect.bottom + EPS_LOCAL) {
      return false;
    }
    return overlapLength(segment.a.x, segment.b.x, rect.left, rect.right) >= MIN_SHARED;
  };

  const lanes = [...nodeByIdMap.values()]
    .map(topLaneTitleFor)
    .filter((lane): lane is LaneTitle => Boolean(lane));
  if (lanes.length === 0) {
    return;
  }

  let topDelta = 0;
  for (const edge of edges) {
    if ((edge as { isLayoutOnly?: boolean }).isLayoutOnly) {
      continue;
    }
    const points = dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? []);
    for (const segment of segmentsFor(points)) {
      for (const lane of lanes) {
        if (!horizontalSegmentIntersectsTitle(segment, lane.rect)) {
          continue;
        }
        topDelta = Math.max(topDelta, lane.rect.bottom - segment.a.y + CLEARANCE);
      }
    }
  }

  if (topDelta <= EPS_LOCAL) {
    return;
  }

  for (const lane of lanes) {
    const y = (lane.node as { y?: number }).y;
    const height = (lane.node as { height?: number }).height;
    if (
      typeof y !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(y) ||
      !Number.isFinite(height) ||
      height <= 0
    ) {
      continue;
    }
    lane.node.y = y - topDelta / 2;
    lane.node.height = height + topDelta;
    lane.node.groupTitleRect = {
      ...lane.rect,
      top: lane.rect.top - topDelta,
      bottom: lane.rect.bottom - topDelta,
    };
  }
}

/**
 * Moves left-lane title bands of an LR or RL layout left of any rail that crosses them.
 * A lane with no `direction` of its own takes the layout's `direction`.
 */
export function shiftLeftLaneTitleBandsLeftOfRails(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>,
  layoutDirection?: string
): void {
  const CLEARANCE = 4;

  interface LaneTitle {
    node: MaterializedNode;
    rect: RectLite;
  }

  const validTitleRect = (node: MaterializedNode): RectLite | undefined => {
    const rect = (node as { groupTitleRect?: Partial<RectBounds> }).groupTitleRect;
    if (
      !rect ||
      typeof rect.left !== 'number' ||
      typeof rect.right !== 'number' ||
      typeof rect.top !== 'number' ||
      typeof rect.bottom !== 'number' ||
      !Number.isFinite(rect.left) ||
      !Number.isFinite(rect.right) ||
      !Number.isFinite(rect.top) ||
      !Number.isFinite(rect.bottom) ||
      rect.right <= rect.left ||
      rect.bottom <= rect.top
    ) {
      return undefined;
    }
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  };

  const laneModel = buildLaneModel([...nodeByIdMap.values()]);

  const leftLaneTitleFor = (node: MaterializedNode): LaneTitle | undefined => {
    if (!laneModel.isLane(node.id)) {
      return undefined;
    }
    const direction = upperCaseDirection(
      (node as { direction?: unknown }).direction ?? layoutDirection
    );
    // RL keeps its title band on the left (D536), so it is shifted as LR's is.
    if (direction !== 'LR' && direction !== 'RL') {
      return undefined;
    }
    const rect = validTitleRect(node);
    const x = (node as { x?: number }).x;
    const width = (node as { width?: number }).width;
    if (
      !rect ||
      typeof x !== 'number' ||
      typeof width !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(width) ||
      width <= 0
    ) {
      return undefined;
    }
    const titleWidth = rect.right - rect.left;
    const titleHeight = rect.bottom - rect.top;
    if (titleWidth <= 0 || titleHeight < titleWidth) {
      return undefined;
    }
    return { node, rect };
  };

  const verticalSegmentIntersectsTitle = (segment: SegmentLite, rect: RectLite): boolean => {
    if (!segment.vertical) {
      return false;
    }
    const x = segment.a.x;
    // A rail along the band's edge counts, as it does for validateLayout.
    if (x < rect.left - EPS_LOCAL || x > rect.right + EPS_LOCAL) {
      return false;
    }
    return overlapLength(segment.a.y, segment.b.y, rect.top, rect.bottom) >= MIN_SHARED;
  };

  const horizontalSegmentIntersectsTitle = (segment: SegmentLite, rect: RectLite): boolean => {
    if (!segment.horizontal) {
      return false;
    }
    const y = segment.a.y;
    // A rail along the band's edge counts, as it does for validateLayout.
    if (y < rect.top - EPS_LOCAL || y > rect.bottom + EPS_LOCAL) {
      return false;
    }
    return overlapLength(segment.a.x, segment.b.x, rect.left, rect.right) >= MIN_SHARED;
  };

  const lanes = [...nodeByIdMap.values()]
    .map(leftLaneTitleFor)
    .filter((lane): lane is LaneTitle => Boolean(lane));
  if (lanes.length === 0) {
    return;
  }

  let leftDelta = 0;
  for (const edge of edges) {
    if ((edge as { isLayoutOnly?: boolean }).isLayoutOnly) {
      continue;
    }
    const points = dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? []);
    for (const segment of segmentsFor(points)) {
      for (const lane of lanes) {
        if (verticalSegmentIntersectsTitle(segment, lane.rect)) {
          leftDelta = Math.max(leftDelta, lane.rect.right - segment.a.x + CLEARANCE);
        } else if (horizontalSegmentIntersectsTitle(segment, lane.rect)) {
          const segmentLeft = Math.min(segment.a.x, segment.b.x);
          leftDelta = Math.max(leftDelta, lane.rect.right - segmentLeft + CLEARANCE);
        }
      }
    }
  }

  if (leftDelta <= EPS_LOCAL) {
    return;
  }

  for (const lane of lanes) {
    const x = (lane.node as { x?: number }).x;
    const width = (lane.node as { width?: number }).width;
    if (
      typeof x !== 'number' ||
      typeof width !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(width) ||
      width <= 0
    ) {
      continue;
    }
    lane.node.x = x - leftDelta / 2;
    lane.node.width = width + leftDelta;
    lane.node.groupTitleRect = {
      ...lane.rect,
      left: lane.rect.left - leftDelta,
      right: lane.rect.right - leftDelta,
    };
  }
}

/**
 * The routes of one round of a post-routing pass, read once and indexed: what each pass needs to
 * score a candidate by what it changes, not by walking every pair of routes again.
 */
function indexRoutes(visibleEdges: readonly MaterializedEdge[]) {
  const points = new Map(
    visibleEdges.map(
      (edge) =>
        [edge, dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? [])] as const
    )
  );
  const segments = new Map(
    visibleEdges.map((edge) => [edge, segmentsFor(points.get(edge)!)] as const)
  );
  const crossings = buildSegmentCrossingIndex([...segments.values()].flat(), EPS_LOCAL);
  const bends = new Map(
    visibleEdges.map((edge) => [edge, countOrthogonalBends(points.get(edge)!)] as const)
  );
  return {
    points,
    segments,
    crossings,
    lines: buildSegmentLineIndex(
      visibleEdges.flatMap((owner) => segments.get(owner)!.map((segment) => ({ owner, segment })))
    ),
    bends,
    totalBends: [...bends.values()].reduce((sum, count) => sum + count, 0),
    ...countCrossingsPerRoute(segments, crossings, EPS_LOCAL),
  };
}

export function swapDestinationTerminalTailsToReduceCrossings(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const MAX_ITERATIONS = 4;

  interface TerminalTail {
    tailStart: PointLite;
    terminal: PointLite;
  }

  const { realNodeRects } = collectNodeRectEntries(nodeByIdMap.values());
  const visibleEdges = edges.filter((edge) => !(edge as { isLayoutOnly?: boolean }).isLayoutOnly);

  // v13 (#843): the routes are read once per round and indexed, and a swap is scored by what it
  // changes. v12 recounted the crossings of every pair of edges and walked every edge for a shared
  // track, for each pair of edges it tried.
  let round = indexRoutes(visibleEdges);

  const replacementPointsFor = (edge: MaterializedEdge): PointLite[] =>
    round.points.get(edge) ?? [];

  const terminalTailFor = (edge: MaterializedEdge): TerminalTail | undefined => {
    const points = replacementPointsFor(edge);
    if (points.length < 4) {
      return undefined;
    }
    const tailStart = points[points.length - 2]!;
    const terminal = points[points.length - 1]!;
    if (
      !isHorizontalSegment(tailStart, terminal, EPS_LOCAL) &&
      !isVerticalSegment(tailStart, terminal, EPS_LOCAL)
    ) {
      return undefined;
    }
    return { tailStart, terminal };
  };

  const candidateWithDestinationTail = (
    edge: MaterializedEdge,
    tail: TerminalTail
  ): PointLite[] | undefined => {
    const points = replacementPointsFor(edge);
    if (points.length < 3) {
      return undefined;
    }
    const start = points[0]!;
    const firstTurn = points[1]!;

    let connector: PointLite;
    if (isHorizontalSegment(start, firstTurn, EPS_LOCAL)) {
      connector = { x: firstTurn.x, y: tail.tailStart.y };
    } else if (isVerticalSegment(start, firstTurn, EPS_LOCAL)) {
      connector = { x: tail.tailStart.x, y: firstTurn.y };
    } else {
      return undefined;
    }

    const candidate = simplifyPolyline(
      dedupeConsecutivePoints([start, firstTurn, connector, tail.tailStart, tail.terminal])
    );
    return segmentsFor(candidate).length === candidate.length - 1 ? candidate : undefined;
  };

  const pathHasNodeHit = (edge: MaterializedEdge, path: PointLite[]): boolean => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    const segments = segmentsFor(path);
    // v13 (#636): the destination is exempt only on the swapped-in last leg; every other leg
    // must keep off its box too, or the swap can lay a rail through or along it.
    const destination = realNodeRects.filter(
      (entry) => entry.id === (edge as { end?: string }).end
    );
    for (const [index, segment] of segments.entries()) {
      if (segmentHitsAnyRect(segment.a, segment.b, realNodeRects, endpointIds, -BUFFER)) {
        return true;
      }
      if (
        index < segments.length - 1 &&
        segmentHitsAnyRect(segment.a, segment.b, destination, [], -BUFFER)
      ) {
        return true;
      }
    }
    return false;
  };

  const sharesTrack = (first: SegmentLite, second: SegmentLite): boolean =>
    sameAxisSegmentOverlapLength(first, second, 0.5) >= MIN_SHARED;

  /** `path` of `edge` shares a track with another route, `partnerPath` standing in for `partner`. */
  const pathHasSharedTrack = (
    [edge, path]: [MaterializedEdge, PointLite[]],
    [partner, partnerPath]: [MaterializedEdge, PointLite[]]
  ): boolean => {
    const partnerSegments = segmentsFor(dedupeConsecutivePoints(partnerPath));
    return segmentsFor(path).some(
      (segment) =>
        partnerSegments.some((other) => sharesTrack(segment, other)) ||
        [...round.lines.sameAxisNear(segment, 1)].some(
          ({ owner, segment: other }) =>
            owner !== edge && owner !== partner && sharesTrack(segment, other)
        )
    );
  };

  const candidateIsSafe = (
    replacement: [MaterializedEdge, PointLite[]],
    partner: [MaterializedEdge, PointLite[]]
  ): boolean =>
    !pathHasNodeHit(replacement[0], replacement[1]) && !pathHasSharedTrack(replacement, partner);

  /** The crossings of `segments` with the round's routes of every edge but `excluded`. */
  const crossingsAmongOthers = (segments: SegmentLite[], excluded: MaterializedEdge[]): number =>
    round.crossings.count(segments) -
    excluded.reduce(
      (sum, edge) => sum + countSegmentCrossings(segments, round.segments.get(edge)!, EPS_LOCAL),
      0
    );

  /** The crossings and the bends of all routes once `first` and `second` take their candidates. */
  const scoreSwap = (
    [first, firstPoints]: [MaterializedEdge, PointLite[]],
    [second, secondPoints]: [MaterializedEdge, PointLite[]]
  ): { crossings: number; bends: number } => {
    const firstSegments = segmentsFor(dedupeConsecutivePoints(firstPoints));
    const secondSegments = segmentsFor(dedupeConsecutivePoints(secondPoints));
    const pair = [first, second];
    const kept =
      round.total -
      (round.byRoute.get(first)! + round.byRoute.get(second)!) +
      countSegmentCrossings(round.segments.get(first)!, round.segments.get(second)!, EPS_LOCAL);
    return {
      crossings:
        kept +
        crossingsAmongOthers(firstSegments, pair) +
        crossingsAmongOthers(secondSegments, pair) +
        countSegmentCrossings(firstSegments, secondSegments, EPS_LOCAL),
      bends:
        round.totalBends -
        round.bends.get(first)! -
        round.bends.get(second)! +
        countOrthogonalBends(dedupeConsecutivePoints(firstPoints)) +
        countOrthogonalBends(dedupeConsecutivePoints(secondPoints)),
    };
  };

  const edgesByDestination = (): Map<string, MaterializedEdge[]> => {
    const result = new Map<string, MaterializedEdge[]>();
    for (const edge of visibleEdges) {
      const dstId = (edge as { end?: string }).end;
      if (!dstId || !nodeByIdMap.has(dstId)) {
        continue;
      }
      const points = replacementPointsFor(edge);
      if (points.length < 4) {
        continue;
      }
      const bucket = result.get(dstId) ?? [];
      bucket.push(edge);
      result.set(dstId, bucket);
    }
    return result;
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (iteration > 0) {
      round = indexRoutes(visibleEdges);
    }
    const currentCrossings = round.total;
    if (currentCrossings === 0) {
      return;
    }
    const currentBends = round.totalBends;

    let bestReplacements: EdgeReplacementMap | undefined;
    let bestCrossings = currentCrossings;
    let bestBends = currentBends;

    for (const destinationEdges of edgesByDestination().values()) {
      for (let i = 0; i < destinationEdges.length; i++) {
        for (let j = i + 1; j < destinationEdges.length; j++) {
          const first = destinationEdges[i]!;
          const second = destinationEdges[j]!;
          const firstTail = terminalTailFor(first);
          const secondTail = terminalTailFor(second);
          if (!firstTail || !secondTail) {
            continue;
          }

          const firstCandidate = candidateWithDestinationTail(first, secondTail);
          const secondCandidate = candidateWithDestinationTail(second, firstTail);
          if (!firstCandidate || !secondCandidate) {
            continue;
          }

          const replacements = new Map<MaterializedEdge, PointLite[]>([
            [first, firstCandidate],
            [second, secondCandidate],
          ]);
          if (
            !candidateIsSafe([first, firstCandidate], [second, secondCandidate]) ||
            !candidateIsSafe([second, secondCandidate], [first, firstCandidate])
          ) {
            continue;
          }

          const { crossings: candidateCrossings, bends: candidateBends } = scoreSwap(
            [first, firstCandidate],
            [second, secondCandidate]
          );
          if (candidateCrossings >= currentCrossings) {
            continue;
          }
          if (
            candidateCrossings > bestCrossings ||
            (candidateCrossings === bestCrossings && candidateBends >= bestBends)
          ) {
            continue;
          }
          bestReplacements = replacements;
          bestCrossings = candidateCrossings;
          bestBends = candidateBends;
        }
      }
    }

    if (!bestReplacements) {
      return;
    }

    for (const [edge, points] of bestReplacements) {
      (edge as { points: PointLite[] }).points = points;
    }
  }
}

// Crossing cleanup sometimes requires reordering a small channel bundle as a
// transaction: moving either rail alone is neutral or worse, while swapping the
// shared external tracks removes crossings. Keep the search local and bounded,
// but score it globally so crossing count stays the first acceptance criterion.
export function reassignCrossingExternalRailChannels(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const RAIL_CHANNEL_GAP = 12;
  const MAX_ITERATIONS = 4;
  const MAX_EXHAUSTIVE_COMPONENT = 6;

  type RailAxis = 'horizontal' | 'vertical';

  interface ExternalRail {
    edge: MaterializedEdge;
    points: PointLite[];
    segmentIndex: number;
    axis: RailAxis;
    side: RectSide;
    coord: number;
    min: number;
    max: number;
  }

  const { realNodeRects, labelNodeRects: labelRects } = collectNodeRectEntries(
    nodeByIdMap.values()
  );
  const visibleEdges = edges.filter((edge) => !(edge as { isLayoutOnly?: boolean }).isLayoutOnly);

  const nodeHits = buildRectHitIndex(realNodeRects, BUFFER);
  const labelHits = buildRectHitIndex(labelRects, BUFFER);

  // v13 (#726): the routes are read once per round and indexed, and a candidate is scored by
  // what it changes. v12 rebuilt every route of a component, recounted the crossings of every
  // pair of edges and walked every pair for a shared track, for each assignment it tried.
  const startRound = () => indexRoutes(visibleEdges);
  let round = startRound();

  const replacementPointsFor = (edge: MaterializedEdge): PointLite[] =>
    round.points.get(edge) ?? [];

  const endpointRectsFor = (
    edge: MaterializedEdge
  ): { src: RectLite; dst: RectLite } | undefined => {
    const srcId = (edge as { start?: string }).start;
    const dstId = (edge as { end?: string }).end;
    const srcNode = srcId ? nodeByIdMap.get(srcId) : undefined;
    const dstNode = dstId ? nodeByIdMap.get(dstId) : undefined;
    const src = srcNode ? rectOfNodeBounds(srcNode) : undefined;
    const dst = dstNode ? rectOfNodeBounds(dstNode) : undefined;
    return src && dst ? { src, dst } : undefined;
  };

  const externalRailForSegment = (
    edge: MaterializedEdge,
    points: PointLite[],
    segment: SegmentLite
  ): ExternalRail | undefined => {
    if (segment.index <= 0 || segment.index + 1 >= points.length - 1) {
      return undefined;
    }

    const endpointRects = endpointRectsFor(edge);
    if (!endpointRects) {
      return undefined;
    }

    if (segment.vertical) {
      const coord = segment.a.x;
      const leftBound = Math.min(endpointRects.src.left, endpointRects.dst.left);
      const rightBound = Math.max(endpointRects.src.right, endpointRects.dst.right);
      const side: RectSide | undefined =
        coord < leftBound - EPS_LOCAL
          ? 'left'
          : coord > rightBound + EPS_LOCAL
            ? 'right'
            : undefined;
      if (!side) {
        return undefined;
      }
      return {
        edge,
        points,
        segmentIndex: segment.index,
        axis: 'vertical',
        side,
        coord,
        min: Math.min(segment.a.y, segment.b.y),
        max: Math.max(segment.a.y, segment.b.y),
      };
    }

    if (segment.horizontal) {
      const coord = segment.a.y;
      const topBound = Math.min(endpointRects.src.top, endpointRects.dst.top);
      const bottomBound = Math.max(endpointRects.src.bottom, endpointRects.dst.bottom);
      const side: RectSide | undefined =
        coord < topBound - EPS_LOCAL
          ? 'top'
          : coord > bottomBound + EPS_LOCAL
            ? 'bottom'
            : undefined;
      if (!side) {
        return undefined;
      }
      return {
        edge,
        points,
        segmentIndex: segment.index,
        axis: 'horizontal',
        side,
        coord,
        min: Math.min(segment.a.x, segment.b.x),
        max: Math.max(segment.a.x, segment.b.x),
      };
    }

    return undefined;
  };

  const collectExternalRails = (): ExternalRail[] => {
    const rails: ExternalRail[] = [];
    for (const edge of visibleEdges) {
      const points = replacementPointsFor(edge);
      for (const segment of round.segments.get(edge) ?? []) {
        const rail = externalRailForSegment(edge, points, segment);
        if (rail) {
          rails.push(rail);
        }
      }
    }
    return rails;
  };

  const railsInteract = (a: ExternalRail, b: ExternalRail): boolean =>
    a.edge !== b.edge &&
    a.axis === b.axis &&
    a.side === b.side &&
    overlapLength(a.min, a.max, b.min, b.max) >= MIN_SHARED;

  const connectedComponents = (rails: ExternalRail[]): ExternalRail[][] => {
    const result: ExternalRail[][] = [];
    const seen = new Set<ExternalRail>();
    for (const rail of rails) {
      if (seen.has(rail)) {
        continue;
      }
      const queue = [rail];
      const component: ExternalRail[] = [];
      seen.add(rail);
      while (queue.length > 0) {
        const current = queue.pop()!;
        component.push(current);
        for (const next of rails) {
          if (!seen.has(next) && railsInteract(current, next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      if (component.length > 1) {
        result.push(component);
      }
    }
    return result;
  };

  const uniqueCoordsFor = (component: ExternalRail[]): number[] => {
    const coords: number[] = [];
    for (const rail of component) {
      if (!coords.some((coord) => Math.abs(coord - rail.coord) < EPS_LOCAL)) {
        coords.push(rail.coord);
      }
    }

    while (coords.length < component.length) {
      const min = Math.min(...coords);
      const max = Math.max(...coords);
      const side = component[0]!.side;
      coords.push(
        side === 'left' || side === 'top'
          ? min - RAIL_CHANNEL_GAP * (component.length - coords.length)
          : max + RAIL_CHANNEL_GAP * (component.length - coords.length)
      );
    }
    return coords;
  };

  const coordinateAssignmentsFor = (component: ExternalRail[]): number[][] => {
    const current = component.map((rail) => rail.coord);
    const coords = uniqueCoordsFor(component);
    const assignments: number[][] = [];

    if (component.length <= MAX_EXHAUSTIVE_COMPONENT) {
      const used = new Array(coords.length).fill(false);
      const next: number[] = [];
      const visit = () => {
        if (next.length === component.length) {
          if (next.some((coord, index) => Math.abs(coord - current[index]!) >= EPS_LOCAL)) {
            assignments.push([...next]);
          }
          return;
        }
        for (const [i, coord] of coords.entries()) {
          if (used[i]) {
            continue;
          }
          used[i] = true;
          next.push(coord);
          visit();
          next.pop();
          used[i] = false;
        }
      };
      visit();
      return assignments;
    }

    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const assignment = [...current];
        [assignment[i], assignment[j]] = [assignment[j]!, assignment[i]!];
        assignments.push(assignment);
      }
    }
    return assignments;
  };

  /** One edge's route with its rails of a component moved to some coordinates. */
  interface Draft {
    /** The replacement the edge would get. */
    points: PointLite[];
    /** Its segments as the other edges meet them: without consecutive duplicate points. */
    segments: SegmentLite[];
    bends: number;
    /** It runs through a node or a label. */
    hitsRect: boolean;
  }

  /** A component of rails, and its edges as they are while their rails keep their places. */
  interface ComponentContext {
    rails: ExternalRail[];
    /** The component's edges, each once, in the order of their first rail. */
    edges: MaterializedEdge[];
    members: Set<MaterializedEdge>;
    /** The places of each edge's rails in `rails`. */
    railsOf: Map<MaterializedEdge, number[]>;
    drafts: Map<MaterializedEdge, Map<string, Draft | undefined>>;
    /** Each edge's draft with its rails where they are; undefined if that is no route. */
    kept: Map<MaterializedEdge, Draft | undefined>;
    /** The kept drafts' segments. */
    lines: SegmentLineIndex<MaterializedEdge>;
    /** For each edge, the edges its kept draft shares a track with. */
    sharing: Map<MaterializedEdge, Set<MaterializedEdge>>;
    /** The number of pairs in `sharing`. */
    sharingPairs: number;
    /** The edges whose kept draft is no route or hits a node: a candidate must move them. */
    mustChange: MaterializedEdge[];
    /** The edges whose kept draft does not have their current segments. */
    simplified: MaterializedEdge[];
    /** The bends of all edges with every kept draft in place. */
    bends: number;
  }

  const sharesTrack = (first: SegmentLite, second: SegmentLite): boolean =>
    sameAxisSegmentOverlapLength(first, second, 0.5) >= MIN_SHARED;

  const sameSegments = (first: SegmentLite[], second: SegmentLite[]): boolean =>
    first.length === second.length &&
    first.every((segment, index) => {
      const other = second[index]!;
      return (
        segment.a.x === other.a.x &&
        segment.a.y === other.a.y &&
        segment.b.x === other.b.x &&
        segment.b.y === other.b.y
      );
    });

  /** The draft of `edge` with its rails at `coordAt(place in the component)`. */
  const draftFor = (
    context: ComponentContext,
    edge: MaterializedEdge,
    coordAt: (place: number) => number
  ): Draft | undefined => {
    const places = context.railsOf.get(edge) ?? [];
    const key = places.map(coordAt).join(',');
    const drafts = context.drafts.get(edge) ?? new Map<string, Draft | undefined>();
    context.drafts.set(edge, drafts);
    if (drafts.has(key)) {
      return drafts.get(key);
    }

    const points = replacementPointsFor(edge).map((point) => ({ x: point.x, y: point.y }));
    for (const place of places) {
      const rail = context.rails[place]!;
      const coord = coordAt(place);
      if (rail.axis === 'vertical') {
        points[rail.segmentIndex]!.x = coord;
        points[rail.segmentIndex + 1]!.x = coord;
      } else {
        points[rail.segmentIndex]!.y = coord;
        points[rail.segmentIndex + 1]!.y = coord;
      }
    }
    const simplified = simplifyPolyline(dedupeConsecutivePoints(points));
    const rawSegments = segmentsFor(simplified);
    let draft: Draft | undefined;
    if (rawSegments.length === simplified.length - 1) {
      const endpointIds = [
        (edge as { start?: string }).start,
        (edge as { end?: string }).end,
      ].filter((id): id is string => Boolean(id));
      const deduped = dedupeConsecutivePoints(simplified);
      draft = {
        points: simplified,
        segments: segmentsFor(deduped),
        bends: countOrthogonalBends(deduped),
        hitsRect: rawSegments.some(
          (segment) =>
            nodeHits.hits(segment.a, segment.b, endpointIds) ||
            labelHits.hits(segment.a, segment.b, [])
        ),
      };
    }
    drafts.set(key, draft);
    return draft;
  };

  const contextFor = (rails: ExternalRail[]): ComponentContext => {
    const railsOf = new Map<MaterializedEdge, number[]>();
    for (const [place, rail] of rails.entries()) {
      const places = railsOf.get(rail.edge) ?? [];
      places.push(place);
      railsOf.set(rail.edge, places);
    }
    const members = [...railsOf.keys()];
    const context: ComponentContext = {
      rails,
      edges: members,
      members: new Set(members),
      railsOf,
      drafts: new Map(),
      kept: new Map(),
      lines: buildSegmentLineIndex([]),
      sharing: new Map(),
      sharingPairs: 0,
      mustChange: [],
      simplified: [],
      bends: round.totalBends,
    };

    for (const edge of members) {
      const kept = draftFor(context, edge, (place) => rails[place]!.coord);
      context.kept.set(edge, kept);
      context.bends += (kept?.bends ?? 0) - (round.bends.get(edge) ?? 0);
      if (!kept || kept.hitsRect) {
        context.mustChange.push(edge);
      }
      if (kept && !sameSegments(kept.segments, round.segments.get(edge) ?? [])) {
        context.simplified.push(edge);
      }
    }
    context.lines = buildSegmentLineIndex(
      members.flatMap((owner) =>
        (context.kept.get(owner)?.segments ?? []).map((segment) => ({ owner, segment }))
      )
    );

    let outside = 0;
    let inside = 0;
    for (const edge of members) {
      const sharing = new Set<MaterializedEdge>();
      for (const segment of context.kept.get(edge)?.segments ?? []) {
        for (const other of round.lines.sameAxisNear(segment, 1)) {
          if (!context.members.has(other.owner) && sharesTrack(segment, other.segment)) {
            sharing.add(other.owner);
          }
        }
      }
      outside += sharing.size;
      for (const segment of context.kept.get(edge)?.segments ?? []) {
        for (const other of context.lines.sameAxisNear(segment, 1)) {
          if (other.owner !== edge && sharesTrack(segment, other.segment)) {
            sharing.add(other.owner);
          }
        }
      }
      inside += sharing.size;
      context.sharing.set(edge, sharing);
    }
    // `inside` has the pairs with an edge outside the component once, and the others twice.
    context.sharingPairs = outside + (inside - outside) / 2;
    return context;
  };

  /** v12's `candidateIsSafe`, for the kept drafts with those of `changed` in their place. */
  const candidateIsSafe = (
    context: ComponentContext,
    changed: Map<MaterializedEdge, Draft>
  ): boolean => {
    if (context.mustChange.some((edge) => !changed.has(edge))) {
      return false;
    }
    const moved = [...changed];
    if (moved.some(([, draft]) => draft.hitsRect)) {
      return false;
    }

    // Every pair that shares a track among the kept drafts must have an edge that moves.
    let covered = 0;
    for (const [index, [edge]] of moved.entries()) {
      const sharing = context.sharing.get(edge);
      covered += sharing?.size ?? 0;
      for (let earlier = 0; earlier < index; earlier++) {
        if (sharing?.has(moved[earlier]![0])) {
          covered--;
        }
      }
    }
    if (covered !== context.sharingPairs) {
      return false;
    }

    for (const [index, [, draft]] of moved.entries()) {
      for (const segment of draft.segments) {
        for (const other of round.lines.sameAxisNear(segment, 1)) {
          if (!context.members.has(other.owner) && sharesTrack(segment, other.segment)) {
            return false;
          }
        }
        for (const other of context.lines.sameAxisNear(segment, 1)) {
          if (!changed.has(other.owner) && sharesTrack(segment, other.segment)) {
            return false;
          }
        }
        for (let later = index + 1; later < moved.length; later++) {
          if (moved[later]![1].segments.some((other) => sharesTrack(segment, other))) {
            return false;
          }
        }
      }
    }
    return true;
  };

  /** v12's `strictCrossingCount`, for the kept drafts with those of `changed` in their place. */
  const crossingCountWith = (
    context: ComponentContext,
    changed: Map<MaterializedEdge, Draft>
  ): number => {
    // The edges whose segments are not their current ones, with the segments they get.
    const state: [MaterializedEdge, SegmentLite[]][] = [];
    for (const edge of context.simplified) {
      if (!changed.has(edge)) {
        state.push([edge, context.kept.get(edge)!.segments]);
      }
    }
    for (const [edge, draft] of changed) {
      state.push([edge, draft.segments]);
    }

    const count = (first: SegmentLite[], second: SegmentLite[]): number =>
      countSegmentCrossings(first, second, EPS_LOCAL);
    let total = round.total;
    for (const [index, [edge, segments]] of state.entries()) {
      const current = round.segments.get(edge) ?? [];
      total += round.crossings.count(segments) - (round.byRoute.get(edge) ?? 0);
      for (const [otherIndex, [other, otherSegments]] of state.entries()) {
        const otherCurrent = round.segments.get(other) ?? [];
        total -= count(segments, otherCurrent);
        if (otherIndex > index) {
          total += count(current, otherCurrent) + count(segments, otherSegments);
        }
      }
    }
    return total;
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    round = startRound();
    const currentCrossings = round.total;
    if (currentCrossings === 0) {
      return;
    }

    let best: { context: ComponentContext; changed: Map<MaterializedEdge, Draft> } | undefined;
    let bestCrossings = currentCrossings;
    let bestBends = round.totalBends;
    let bestDisplacement = Number.POSITIVE_INFINITY;

    /** Scores the component with its rails at `coordAt(place)`, moved by `displacement`. */
    const consider = (
      context: ComponentContext,
      among: Iterable<MaterializedEdge>,
      coordAt: (place: number) => number,
      displacement: () => number
    ): void => {
      const changed = new Map<MaterializedEdge, Draft>();
      for (const edge of among) {
        const draft = draftFor(context, edge, coordAt);
        if (!draft) {
          return;
        }
        if (draft !== context.kept.get(edge)) {
          changed.set(edge, draft);
        }
      }
      if (!candidateIsSafe(context, changed)) {
        return;
      }

      const candidateCrossings = crossingCountWith(context, changed);
      if (candidateCrossings >= currentCrossings) {
        return;
      }
      let candidateBends = context.bends;
      for (const [edge, draft] of changed) {
        candidateBends += draft.bends - (context.kept.get(edge)?.bends ?? 0);
      }
      const candidateDisplacement = displacement();

      if (
        candidateCrossings > bestCrossings ||
        (candidateCrossings === bestCrossings &&
          (candidateBends > bestBends ||
            (candidateBends === bestBends && candidateDisplacement >= bestDisplacement)))
      ) {
        return;
      }

      best = { context, changed };
      bestCrossings = candidateCrossings;
      bestBends = candidateBends;
      bestDisplacement = candidateDisplacement;
    };

    for (const component of connectedComponents(collectExternalRails())) {
      const context = contextFor(component);
      if (component.length <= MAX_EXHAUSTIVE_COMPONENT) {
        for (const assignment of coordinateAssignmentsFor(component)) {
          consider(
            context,
            context.edges,
            (place) => assignment[place]!,
            () =>
              component.reduce(
                (sum, rail, index) => sum + Math.abs(assignment[index]! - rail.coord),
                0
              )
          );
        }
        continue;
      }

      // A larger component: every exchange of two rails' coordinates, in v12's order. Only
      // the two rails' edges can change.
      for (let i = 0; i < component.length; i++) {
        for (let j = i + 1; j < component.length; j++) {
          const [first, second] = [component[i]!, component[j]!];
          const coordAt = (place: number): number =>
            place === i ? second.coord : place === j ? first.coord : component[place]!.coord;
          consider(
            context,
            first.edge === second.edge ? [first.edge] : [first.edge, second.edge],
            coordAt,
            () => 0 + Math.abs(second.coord - first.coord) + Math.abs(first.coord - second.coord)
          );
        }
      }
    }

    if (!best) {
      return;
    }

    for (const edge of best.context.edges) {
      const draft = best.changed.get(edge) ?? best.context.kept.get(edge);
      if (draft) {
        (edge as { points: PointLite[] }).points = draft.points;
      }
    }
  }
}

export function shortcutRedundantOrthogonalJogs(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const BUFFER = 2;
  const MAX_ITERATIONS = 8;

  const { realNodeRects, labelNodeRects: labelRects } = collectNodeRectEntries(
    nodeByIdMap.values()
  );
  const visibleEdges = edges.filter((edge) => !(edge as { isLayoutOnly?: boolean }).isLayoutOnly);

  const nodeHits = buildRectHitIndex(realNodeRects, BUFFER);
  const labelHits = buildRectHitIndex(labelRects, BUFFER);

  // v13 (#726): the routes are read once per round and indexed. v12 recounted the crossings
  // of every pair of edges for each candidate, and walked every edge for a shared track.
  const startRound = () => indexRoutes(visibleEdges);
  let round = startRound();

  const pointsFor = (edge: MaterializedEdge): PointLite[] => round.points.get(edge) ?? [];

  const pathLength = (points: PointLite[]): number =>
    segmentsFor(points).reduce((sum, segment) => {
      const dx = segment.a.x - segment.b.x;
      const dy = segment.a.y - segment.b.y;
      return sum + Math.hypot(dx, dy);
    }, 0);

  /** Every crossing between two visible edges, with `replacementEdge` rerouted if given. */
  const strictCrossingCount = (
    replacementEdge?: MaterializedEdge,
    replacement?: PointLite[]
  ): number => {
    if (!replacementEdge) {
      return round.total;
    }
    const rerouted = segmentsFor(dedupeConsecutivePoints(replacement ?? []));
    return (
      round.total -
      (round.byRoute.get(replacementEdge) ?? 0) +
      round.crossings.count(rerouted) -
      countSegmentCrossings(rerouted, round.segments.get(replacementEdge) ?? [], EPS_LOCAL)
    );
  };

  const segmentRunsAlongRectBorder = (segment: SegmentLite, rect: RectLite): boolean => {
    if (segment.horizontal) {
      const y = segment.a.y;
      const onBorder = Math.abs(y - rect.top) < 1 || Math.abs(y - rect.bottom) < 1;
      return (
        onBorder && overlapLength(segment.a.x, segment.b.x, rect.left, rect.right) >= MIN_SHARED
      );
    }

    if (segment.vertical) {
      const x = segment.a.x;
      const onBorder = Math.abs(x - rect.left) < 1 || Math.abs(x - rect.right) < 1;
      return (
        onBorder && overlapLength(segment.a.y, segment.b.y, rect.top, rect.bottom) >= MIN_SHARED
      );
    }

    return false;
  };

  const endpointRectsFor = (edge: MaterializedEdge): RectLite[] => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    const rects: RectLite[] = [];
    for (const id of endpointIds) {
      const node = nodeByIdMap.get(id);
      const rect = node ? rectOfNodeBounds(node) : undefined;
      if (rect) {
        rects.push(rect);
      }
    }
    return rects;
  };

  const shortcutCandidatesAt = (points: PointLite[], index: number): PointLite[][] => {
    if (index + 3 >= points.length) {
      return [];
    }

    const p0 = points[index]!;
    const p1 = points[index + 1]!;
    const p2 = points[index + 2]!;
    const p3 = points[index + 3]!;
    const isHVH =
      isHorizontalSegment(p0, p1, EPS_LOCAL) &&
      isVerticalSegment(p1, p2, EPS_LOCAL) &&
      isHorizontalSegment(p2, p3, EPS_LOCAL);
    const isVHV =
      isVerticalSegment(p0, p1, EPS_LOCAL) &&
      isHorizontalSegment(p1, p2, EPS_LOCAL) &&
      isVerticalSegment(p2, p3, EPS_LOCAL);
    if (!isHVH && !isVHV) {
      return [];
    }
    const outerSegmentsOppose = isHVH
      ? Math.sign(p1.x - p0.x) !== Math.sign(p3.x - p2.x)
      : Math.sign(p1.y - p0.y) !== Math.sign(p3.y - p2.y);
    if (!outerSegmentsOppose) {
      return [];
    }

    const corners =
      sameX(p0, p3, EPS_LOCAL) || sameY(p0, p3, EPS_LOCAL)
        ? []
        : [
            { x: p0.x, y: p3.y },
            { x: p3.x, y: p0.y },
          ];
    const rawCandidates =
      corners.length === 0
        ? [[...points.slice(0, index + 1), ...points.slice(index + 3)]]
        : corners.map((corner) => [
            ...points.slice(0, index + 1),
            corner,
            ...points.slice(index + 3),
          ]);

    const seen = new Set<string>();
    return rawCandidates
      .map((candidate) => simplifyPolyline(dedupeConsecutivePoints(candidate)))
      .filter((candidate) => {
        if (segmentsFor(candidate).length !== candidate.length - 1) {
          return false;
        }
        if (!candidate.some((point) => samePoint(point, p3, EPS_LOCAL))) {
          return false;
        }
        const key = candidate
          .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
          .join('|');
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
  };

  const candidateIsSafe = (
    edge: MaterializedEdge,
    candidate: PointLite[],
    currentCrossings: number
  ): boolean => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    const endpointRects = endpointRectsFor(edge);

    const candidateSegments = segmentsFor(candidate);
    for (const segment of candidateSegments) {
      if (nodeHits.hits(segment.a, segment.b, endpointIds)) {
        return false;
      }
      if (labelHits.hits(segment.a, segment.b, [])) {
        return false;
      }
      if (endpointRects.some((rect) => segmentRunsAlongRectBorder(segment, rect))) {
        return false;
      }
    }

    for (const candidateSegment of candidateSegments) {
      for (const other of round.lines.sameAxisNear(candidateSegment, 1)) {
        if (
          other.owner !== edge &&
          sameAxisSegmentOverlapLength(candidateSegment, other.segment, 0.5) >= MIN_SHARED
        ) {
          return false;
        }
      }
    }

    return strictCrossingCount(edge, candidate) <= currentCrossings;
  };

  // v13 (#683): whether a route runs through `rect`, the box of its own start or end, not only
  // touching it. A shortcut must not make a route run through either box it did not already run
  // through; the cause v12 found in mermaid-js/mermaid#8698.
  const entersRect = (points: PointLite[], rect: RectLite): boolean =>
    segmentsFor(points).some((segment) =>
      segmentBoundsOverlapRect(segment.a, segment.b, rect, -BUFFER)
    );
  const entersAnotherEndBox = (edge: MaterializedEdge, candidate: PointLite[]): boolean =>
    endpointRectsFor(edge).some(
      (rect) => !entersRect(pointsFor(edge), rect) && entersRect(candidate, rect)
    );

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    round = startRound();
    const currentCrossings = strictCrossingCount();
    let bestEdge: { points?: PointLite[] } | undefined;
    let bestPath: PointLite[] | undefined;
    let bestCrossings = currentCrossings;
    let bestBends = Number.POSITIVE_INFINITY;
    let bestLength = Number.POSITIVE_INFINITY;

    for (const edge of visibleEdges) {
      const currentPoints = pointsFor(edge);
      const currentBends = countOrthogonalBends(currentPoints, EPS_LOCAL);
      const currentLength = pathLength(currentPoints);
      for (let index = 0; index <= currentPoints.length - 4; index++) {
        for (const candidate of shortcutCandidatesAt(currentPoints, index)) {
          const candidateBends = countOrthogonalBends(candidate, EPS_LOCAL);
          const candidateLength = pathLength(candidate);
          const improvesShape =
            candidateBends < currentBends ||
            (candidateBends === currentBends && candidateLength < currentLength - EPS_LOCAL);
          if (
            !improvesShape ||
            entersAnotherEndBox(edge, candidate) ||
            !candidateIsSafe(edge, candidate, currentCrossings)
          ) {
            continue;
          }

          const candidateCrossings = strictCrossingCount(edge, candidate);
          if (
            candidateCrossings > bestCrossings ||
            (candidateCrossings === bestCrossings &&
              (candidateBends > bestBends ||
                (candidateBends === bestBends && candidateLength >= bestLength)))
          ) {
            continue;
          }

          bestEdge = edge;
          bestPath = candidate;
          bestCrossings = candidateCrossings;
          bestBends = candidateBends;
          bestLength = candidateLength;
        }
      }
    }

    if (!bestEdge || !bestPath) {
      return;
    }

    bestEdge.points = bestPath;
  }
}

export function resolveRenderedOrthogonalCrossings(
  edges: MaterializedEdge[],
  nodeByIdMap: Map<string, MaterializedNode>
): void {
  const ANCHOR = 20;
  const EXTRA_CHANNEL_COUNT = 2;
  const MAX_ITERATIONS = 4;
  const MAX_PAIR_CANDIDATES_PER_EDGE = 48;

  interface NodeInfo {
    id: string;
    cx: number;
    cy: number;
    rect: RectLite;
  }

  interface CrossingPair {
    first: MaterializedEdge;
    second: MaterializedEdge;
    count: number;
  }

  interface CrossingSnapshot {
    count: number;
    pairs: CrossingPair[];
    edgeSet: Set<MaterializedEdge>;
    edges: MaterializedEdge[];
  }

  /** The routes as one round finds them: none moves before the round ends. */
  interface Round {
    /** Each visible edge's points, without consecutive duplicates. */
    points: Map<MaterializedEdge, PointLite[]>;
    segments: Map<MaterializedEdge, SegmentLite[]>;
    crossings: SegmentCrossingIndex;
    /** Built when a candidate is first tested for shared tracks. */
    conflicts?: TrackConflictIndex<MaterializedEdge>;
    candidates: Map<MaterializedEdge, Candidate[]>;
  }

  /** A candidate reroute, with what the search for one edge's reroute reads of it. */
  interface Candidate {
    path: PointLite[];
    /** The segments of the path without consecutive duplicate points. */
    rerouted: SegmentLite[];
    bends: number;
  }

  interface PairCandidate {
    path: PointLite[];
    segments: SegmentLite[];
    sharedTrackConflicts: Set<MaterializedEdge>;
    /** Its crossings with every edge but its own. */
    crossingsWithOthers: number;
    totalBends: number;
    length: number;
    shape?: RouteShape;
  }

  interface PairOption {
    edge: MaterializedEdge;
    candidates: PairCandidate[];
  }

  interface PairReplacementScore {
    replacements: EdgeReplacementMap;
    crossings: number;
    bends: number;
    length: number;
  }

  interface PairScoringContext {
    current: CrossingSnapshot;
    currentBends: number;
    currentLength: number;
    baseBendsByEdge: Map<MaterializedEdge, number>;
    baseLengthByEdge: Map<MaterializedEdge, number>;
    crossingCountByEdge: Map<MaterializedEdge, number>;
    /** The crossings of each crossing pair, under either edge. */
    pairCounts: Map<MaterializedEdge, Map<MaterializedEdge, number>>;
  }

  const realNodes: NodeInfo[] = [];
  for (const node of nodeByIdMap.values()) {
    if (
      (node as { isGroup?: boolean }).isGroup ||
      (node as { isEdgeLabel?: boolean }).isEdgeLabel
    ) {
      continue;
    }
    const cx = (node as { x?: number }).x ?? 0;
    const cy = (node as { y?: number }).y ?? 0;
    const rect = rectOfNodeBounds(node);
    if (!rect) {
      continue;
    }
    realNodes.push({
      id: String((node as { id?: string }).id ?? ''),
      cx,
      cy,
      rect,
    });
  }

  if (realNodes.length === 0) {
    return;
  }

  const nodeInfoById = new Map(realNodes.map((node) => [node.id, node]));
  const realNodeRects = realNodes.map((node) => ({ id: node.id, rect: node.rect }));
  const sides: RectSide[] = ['top', 'bottom', 'left', 'right'];
  const outsideTracks = {
    top: Math.min(...realNodes.map((node) => node.rect.top)) - ANCHOR,
    bottom: Math.max(...realNodes.map((node) => node.rect.bottom)) + ANCHOR,
    left: Math.min(...realNodes.map((node) => node.rect.left)) - ANCHOR,
    right: Math.max(...realNodes.map((node) => node.rect.right)) + ANCHOR,
  };

  const visibleEdges = edges.filter((edge) => !(edge as { isLayoutOnly?: boolean }).isLayoutOnly);
  const edgeIndex = new Map(visibleEdges.map((edge, index) => [edge, index]));
  // v13 (#683): the routes as they came in, for `keepSameLaneEdgesInside`.
  const routedBefore = new Map(
    visibleEdges.map((edge) => [edge, dedupeConsecutivePoints(edge.points ?? [])] as const)
  );

  // The outer tracks candidates are built on: the diagram's, or while an edge is brought back
  // into its lane, that lane's own (#683).
  let activeTracks: Record<RectSide, number> = outsideTracks;
  const outwardTracksForSide = (side: RectSide): number[] => {
    const outward = side === 'left' || side === 'top' ? -1 : 1;
    const tracks: number[] = [];
    for (let channel = 0; channel <= EXTRA_CHANNEL_COUNT; channel++) {
      tracks.push(activeTracks[side] + outward * ANCHOR * channel);
    }
    return tracks;
  };

  // v13 (#687): what the pass reads of the routes is kept once per round and indexed. v12
  // derived it again for every candidate, and walked every pair of edges to score one.
  const startRound = (): Round => {
    const points = new Map(
      visibleEdges.map(
        (edge) =>
          [edge, dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? [])] as const
      )
    );
    const segments = new Map(
      visibleEdges.map((edge) => [edge, segmentsFor(points.get(edge)!)] as const)
    );
    return {
      points,
      segments,
      crossings: buildSegmentCrossingIndex([...segments.values()].flat(), EPS_LOCAL),
      candidates: new Map(),
    };
  };
  let round = startRound();

  const basePointsFor = (edge: MaterializedEdge): PointLite[] => round.points.get(edge) ?? [];
  const baseSegmentsFor = (edge: MaterializedEdge): SegmentLite[] => round.segments.get(edge) ?? [];

  const routeShape = (points: PointLite[], segments = segmentsFor(points)): RouteShape => ({
    segments,
    touchSegments: segmentsFor(dedupeConsecutivePoints(points)),
    bends: bendPoints(points),
  });

  const crossingCountBetweenSegments = (
    firstSegments: SegmentLite[],
    secondSegments: SegmentLite[]
  ): number => countSegmentCrossings(firstSegments, secondSegments, EPS_LOCAL);

  /** The crossings of a reroute of `edge`, given as segments, with every other edge. */
  const crossingsWithOtherEdges = (edge: MaterializedEdge, segments: SegmentLite[]): number =>
    crossingsWithOtherEdgesUpTo(edge, segments, Number.POSITIVE_INFINITY);
  /** `crossingsWithOtherEdges` when it is at most `limit`, else a number above `limit`. */
  const crossingsWithOtherEdgesUpTo = (
    edge: MaterializedEdge,
    segments: SegmentLite[],
    limit: number
  ): number =>
    countCrossingsWithOthersUpTo(
      round.crossings,
      segments,
      baseSegmentsFor(edge),
      EPS_LOCAL,
      limit
    );

  /** The box around a route; two routes whose boxes are apart do not cross. */
  const extentOf = (points: PointLite[]): RectLite => {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    };
  };
  const apart = (a: RectLite, b: RectLite): boolean =>
    a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top;

  const crossingSnapshot = (): CrossingSnapshot => {
    let count = 0;
    const pairs: CrossingPair[] = [];
    const edgeSet = new Set<MaterializedEdge>();
    const edgeOrder: MaterializedEdge[] = [];
    const addEdge = (edge: MaterializedEdge): void => {
      if (!edgeSet.has(edge)) {
        edgeSet.add(edge);
        edgeOrder.push(edge);
      }
    };

    const extents = visibleEdges.map((edge) => extentOf(basePointsFor(edge)));
    for (let i = 0; i < visibleEdges.length; i++) {
      const first = visibleEdges[i]!;
      const firstSegments = baseSegmentsFor(first);
      for (let j = i + 1; j < visibleEdges.length; j++) {
        if (apart(extents[i]!, extents[j]!)) {
          continue;
        }
        const second = visibleEdges[j]!;
        const pairCount = crossingCountBetweenSegments(firstSegments, baseSegmentsFor(second));
        if (pairCount > 0) {
          count += pairCount;
          pairs.push({ first, second, count: pairCount });
          addEdge(first);
          addEdge(second);
        }
      }
    }

    edgeOrder.sort((a, b) => (edgeIndex.get(a) ?? 0) - (edgeIndex.get(b) ?? 0));
    return {
      count,
      pairs,
      edgeSet,
      edges: edgeOrder,
    };
  };

  const crossingComponents = (snapshot: CrossingSnapshot): MaterializedEdge[][] => {
    const neighbors = new Map<MaterializedEdge, Set<MaterializedEdge>>();
    for (const pair of snapshot.pairs) {
      const firstNeighbors = neighbors.get(pair.first) ?? new Set<MaterializedEdge>();
      firstNeighbors.add(pair.second);
      neighbors.set(pair.first, firstNeighbors);

      const secondNeighbors = neighbors.get(pair.second) ?? new Set<MaterializedEdge>();
      secondNeighbors.add(pair.first);
      neighbors.set(pair.second, secondNeighbors);
    }

    const components: MaterializedEdge[][] = [];
    const seen = new Set<MaterializedEdge>();
    for (const edge of snapshot.edges) {
      if (seen.has(edge)) {
        continue;
      }
      const queue = [edge];
      const component: MaterializedEdge[] = [];
      seen.add(edge);
      while (queue.length > 0) {
        const current = queue.pop()!;
        component.push(current);
        for (const next of neighbors.get(current) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      component.sort((a, b) => (edgeIndex.get(a) ?? 0) - (edgeIndex.get(b) ?? 0));
      if (component.length > 1) {
        components.push(component);
      }
    }

    return components;
  };

  const endpointIdsFor = (edge: MaterializedEdge): string[] =>
    [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );

  const pairSearchGroups = (snapshot: CrossingSnapshot): MaterializedEdge[][] => {
    const groups: MaterializedEdge[][] = [];
    for (const component of crossingComponents(snapshot)) {
      const componentSet = new Set(component);
      const componentEndpointIds = new Set(component.flatMap((edge) => endpointIdsFor(edge)));
      const group = [...component];
      for (const edge of visibleEdges) {
        if (componentSet.has(edge)) {
          continue;
        }
        if (endpointIdsFor(edge).some((id) => componentEndpointIds.has(id))) {
          group.push(edge);
        }
      }
      group.sort((a, b) => (edgeIndex.get(a) ?? 0) - (edgeIndex.get(b) ?? 0));
      groups.push(group);
    }
    return groups;
  };

  const currentCrossingsByEdge = (current: CrossingSnapshot): Map<MaterializedEdge, number> => {
    const result = new Map<MaterializedEdge, number>();
    for (const pair of current.pairs) {
      result.set(pair.first, (result.get(pair.first) ?? 0) + pair.count);
      result.set(pair.second, (result.get(pair.second) ?? 0) + pair.count);
    }
    return result;
  };

  const pathLength = (points: PointLite[]): number =>
    points.slice(1).reduce((sum, point, index) => {
      const previous = points[index]!;
      return sum + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
    }, 0);

  const totalBends = (): number =>
    visibleEdges.reduce((sum, edge) => sum + countOrthogonalBends(basePointsFor(edge)), 0);

  const totalLength = (): number =>
    visibleEdges.reduce((sum, edge) => sum + pathLength(basePointsFor(edge)), 0);

  const nodeHits = buildRectHitIndex(realNodeRects, 2);
  const pathHitsNode = (edge: MaterializedEdge, pathSegments: SegmentLite[]): boolean => {
    const endpointIds = [(edge as { start?: string }).start, (edge as { end?: string }).end].filter(
      (id): id is string => Boolean(id)
    );
    return pathSegments.some((segment) => nodeHits.hits(segment.a, segment.b, endpointIds));
  };

  const pushOrthogonalCandidate = (candidates: PointLite[][], points: PointLite[]): void => {
    const candidate = simplifyPolyline(dedupeConsecutivePoints(points));
    if (segmentsFor(candidate).length === candidate.length - 1) {
      candidates.push(candidate);
    }
  };

  const sideIsHorizontal = (side: RectSide): boolean => side === 'left' || side === 'right';

  const localTrackForSameSide = (src: PointLite, side: RectSide, dst: PointLite): number => {
    switch (side) {
      case 'left':
        return Math.min(src.x, dst.x) - ANCHOR;
      case 'right':
        return Math.max(src.x, dst.x) + ANCHOR;
      case 'top':
        return Math.min(src.y, dst.y) - ANCHOR;
      case 'bottom':
        return Math.max(src.y, dst.y) + ANCHOR;
    }
  };

  const addSameSideCandidates = (
    candidates: PointLite[][],
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite
  ): void => {
    const outward = srcSide === 'left' || srcSide === 'top' ? -1 : 1;
    const trackSeeds = [localTrackForSameSide(src, srcSide, dst), activeTracks[srcSide]];
    for (const seed of trackSeeds) {
      for (let channel = 0; channel <= EXTRA_CHANNEL_COUNT; channel++) {
        pushOrthogonalCandidate(
          candidates,
          buildSameSideTrackPath(src, srcSide, dst, seed + outward * ANCHOR * channel)
        );
      }
    }
  };

  const addHorizontalToVerticalCandidates = (
    candidates: PointLite[][],
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite,
    dstSide: RectSide
  ): void => {
    for (const xTrack of outwardTracksForSide(srcSide)) {
      for (const yTrack of outwardTracksForSide(dstSide)) {
        pushOrthogonalCandidate(candidates, [
          src,
          { x: xTrack, y: src.y },
          { x: xTrack, y: yTrack },
          { x: dst.x, y: yTrack },
          dst,
        ]);
      }
    }
  };

  const addVerticalToHorizontalCandidates = (
    candidates: PointLite[][],
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite,
    dstSide: RectSide
  ): void => {
    for (const yTrack of outwardTracksForSide(srcSide)) {
      for (const xTrack of outwardTracksForSide(dstSide)) {
        pushOrthogonalCandidate(candidates, [
          src,
          { x: src.x, y: yTrack },
          { x: xTrack, y: yTrack },
          { x: xTrack, y: dst.y },
          dst,
        ]);
      }
    }
  };

  const addHorizontalPairCandidates = (
    candidates: PointLite[][],
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite,
    dstSide: RectSide
  ): void => {
    const yTracks = [...outwardTracksForSide('top'), ...outwardTracksForSide('bottom')];
    for (const srcTrack of outwardTracksForSide(srcSide)) {
      for (const dstTrack of outwardTracksForSide(dstSide)) {
        for (const yTrack of yTracks) {
          pushOrthogonalCandidate(candidates, [
            src,
            { x: srcTrack, y: src.y },
            { x: srcTrack, y: yTrack },
            { x: dstTrack, y: yTrack },
            { x: dstTrack, y: dst.y },
            dst,
          ]);
        }
      }
    }
  };

  const addVerticalPairCandidates = (
    candidates: PointLite[][],
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite,
    dstSide: RectSide
  ): void => {
    const xTracks = [...outwardTracksForSide('left'), ...outwardTracksForSide('right')];
    for (const srcTrack of outwardTracksForSide(srcSide)) {
      for (const dstTrack of outwardTracksForSide(dstSide)) {
        for (const xTrack of xTracks) {
          pushOrthogonalCandidate(candidates, [
            src,
            { x: src.x, y: srcTrack },
            { x: xTrack, y: srcTrack },
            { x: xTrack, y: dstTrack },
            { x: dst.x, y: dstTrack },
            dst,
          ]);
        }
      }
    }
  };

  const dedupeCandidatePaths = (candidates: PointLite[][]): PointLite[][] => {
    const seen = new Set<string>();
    return candidates
      .map((candidate) => dedupeConsecutivePoints(candidate))
      .filter((candidate) => {
        const key = candidate
          .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
          .join('|');
        if (seen.has(key) || candidate.length < 2) {
          return false;
        }
        seen.add(key);
        return true;
      });
  };

  const buildCandidatesForSides = (
    src: PointLite,
    srcSide: RectSide,
    dst: PointLite,
    dstSide: RectSide
  ): PointLite[][] => {
    const candidates: PointLite[][] = [];
    const base = buildOrthogonalPortPath(src, srcSide, dst, dstSide, ANCHOR, EPS_LOCAL);
    if (base) {
      pushOrthogonalCandidate(candidates, base);
    }
    if (srcSide === dstSide) {
      addSameSideCandidates(candidates, src, srcSide, dst);
    }

    const srcHorizontal = sideIsHorizontal(srcSide);
    const dstHorizontal = sideIsHorizontal(dstSide);
    if (srcHorizontal && !dstHorizontal) {
      addHorizontalToVerticalCandidates(candidates, src, srcSide, dst, dstSide);
    } else if (!srcHorizontal && dstHorizontal) {
      addVerticalToHorizontalCandidates(candidates, src, srcSide, dst, dstSide);
    } else if (srcHorizontal) {
      addHorizontalPairCandidates(candidates, src, srcSide, dst, dstSide);
    } else {
      addVerticalPairCandidates(candidates, src, srcSide, dst, dstSide);
    }

    return dedupeCandidatePaths(candidates);
  };

  const addVerticalDepartureOuterTrackCandidates = (
    candidates: PointLite[][],
    first: PointLite,
    departure: PointLite,
    dstNode: NodeInfo
  ): void => {
    const externalXTracks = [...outwardTracksForSide('left'), ...outwardTracksForSide('right')];
    const externalYTracks = [...outwardTracksForSide('top'), ...outwardTracksForSide('bottom')];
    for (const side of sides) {
      const dst = portForRectSide(dstNode, side);
      const targetYTracks =
        side === 'top' || side === 'bottom' ? outwardTracksForSide(side) : externalYTracks;
      for (const track of externalXTracks) {
        if (sideIsHorizontal(side)) {
          pushOrthogonalCandidate(candidates, [
            first,
            departure,
            { x: track, y: departure.y },
            { x: track, y: dst.y },
            dst,
          ]);
        }
        for (const targetTrack of targetYTracks) {
          pushOrthogonalCandidate(candidates, [
            first,
            departure,
            { x: track, y: departure.y },
            { x: track, y: targetTrack },
            { x: dst.x, y: targetTrack },
            dst,
          ]);
        }
      }
    }
  };

  const addHorizontalDepartureOuterTrackCandidates = (
    candidates: PointLite[][],
    first: PointLite,
    departure: PointLite,
    dstNode: NodeInfo
  ): void => {
    const externalXTracks = [...outwardTracksForSide('left'), ...outwardTracksForSide('right')];
    const externalYTracks = [...outwardTracksForSide('top'), ...outwardTracksForSide('bottom')];
    for (const side of sides) {
      const dst = portForRectSide(dstNode, side);
      const targetXTracks =
        side === 'left' || side === 'right' ? outwardTracksForSide(side) : externalXTracks;
      for (const track of externalYTracks) {
        if (!sideIsHorizontal(side)) {
          pushOrthogonalCandidate(candidates, [
            first,
            departure,
            { x: departure.x, y: track },
            { x: dst.x, y: track },
            dst,
          ]);
        }
        for (const targetTrack of targetXTracks) {
          pushOrthogonalCandidate(candidates, [
            first,
            departure,
            { x: departure.x, y: track },
            { x: targetTrack, y: track },
            { x: targetTrack, y: dst.y },
            dst,
          ]);
        }
      }
    }
  };

  const terminalPreservingOuterTrackCandidates = (edge: MaterializedEdge): PointLite[][] => {
    const srcId = (edge as { start?: string }).start;
    const dstId = (edge as { end?: string }).end;
    const dstNode = dstId ? nodeInfoById.get(dstId) : undefined;
    if (!srcId || !dstNode) {
      return [];
    }

    const points = dedupeConsecutivePoints((edge as { points?: PointLite[] }).points ?? []);
    if (points.length < 4) {
      return [];
    }

    const first = points[0]!;
    const departure = points[1]!;
    const candidates: PointLite[][] = [];
    if (isVerticalSegment(first, departure, EPS_LOCAL)) {
      addVerticalDepartureOuterTrackCandidates(candidates, first, departure, dstNode);
    } else if (isHorizontalSegment(first, departure, EPS_LOCAL)) {
      addHorizontalDepartureOuterTrackCandidates(candidates, first, departure, dstNode);
    }

    return candidates;
  };

  const toCandidate = (path: PointLite[]): Candidate => ({
    path,
    rerouted: segmentsFor(dedupeConsecutivePoints(path)),
    bends: countOrthogonalBends(path, EPS_LOCAL),
  });

  // v13 (#687): the candidates between the sides of two nodes depend on the two nodes alone,
  // so they are built once for all rounds and for every edge between the same two nodes.
  const sideCandidates = new Map<NodeInfo, Map<NodeInfo, Candidate[]>>();
  const sideCandidatesFor = (srcNode: NodeInfo, dstNode: NodeInfo): Candidate[] => {
    const fromSrc = sideCandidates.get(srcNode) ?? new Map<NodeInfo, Candidate[]>();
    sideCandidates.set(srcNode, fromSrc);
    let candidates = fromSrc.get(dstNode);
    if (!candidates) {
      candidates = [];
      for (const srcSide of sides) {
        const srcPort = portForRectSide(srcNode, srcSide);
        for (const dstSide of sides) {
          const dstPort = portForRectSide(dstNode, dstSide);
          for (const path of buildCandidatesForSides(srcPort, srcSide, dstPort, dstSide)) {
            candidates.push(toCandidate(path));
          }
        }
      }
      fromSrc.set(dstNode, candidates);
    }
    return candidates;
  };

  /** An edge's candidates for this round: those of its nodes' sides, then those of its route. */
  const candidatesFor = (edge: MaterializedEdge): Candidate[] => {
    let candidates = round.candidates.get(edge);
    if (!candidates) {
      const srcId = (edge as { start?: string }).start;
      const dstId = (edge as { end?: string }).end;
      const srcNode = srcId ? nodeInfoById.get(srcId) : undefined;
      const dstNode = dstId ? nodeInfoById.get(dstId) : undefined;
      candidates =
        srcNode && dstNode
          ? [
              ...sideCandidatesFor(srcNode, dstNode),
              ...terminalPreservingOuterTrackCandidates(edge).map(toCandidate),
            ]
          : [];
      round.candidates.set(edge, candidates);
    }
    return candidates;
  };

  /**
   * The other edges a candidate shares a track with, or touches at a bend: the first `limit`
   * found. One tells that the candidate cannot replace its edge alone; a second, that it
   * cannot in a pair either.
   */
  const sharedTrackConflictsFor = (
    edge: MaterializedEdge,
    candidatePath: PointLite[],
    candidateSegments: SegmentLite[],
    limit: 1 | 2
  ): Set<MaterializedEdge> => {
    round.conflicts ??= buildTrackConflictIndex(
      visibleEdges.map((other) => [other, routeShape(basePointsFor(other))] as const),
      {
        lineTolerance: 0.5,
        minShared: MIN_SHARED,
        touchTolerance: EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE,
      }
    );
    return round.conflicts.conflicts(routeShape(candidatePath, candidateSegments), edge, limit);
  };

  const pairCandidatesFor = (
    edge: MaterializedEdge,
    current: CrossingSnapshot,
    crossingCountByEdge: Map<MaterializedEdge, number>
  ): PairCandidate[] => {
    const seen = new Set<string>();
    const candidates = candidatesFor(edge)
      .map((candidate) => simplifyPolyline(dedupeConsecutivePoints(candidate.path)))
      .filter((candidate) => {
        if (pathHitsNode(edge, segmentsFor(candidate))) {
          return false;
        }
        const key = candidate
          .map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`)
          .join('|');
        if (seen.has(key) || candidate.length < 2) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((candidate) => {
        const candidateSegments = segmentsFor(candidate);
        const crossingsWithOthers = crossingsWithOtherEdges(edge, candidateSegments);
        return {
          candidate,
          candidateSegments,
          crossingsWithOthers,
          crossings: current.count - (crossingCountByEdge.get(edge) ?? 0) + crossingsWithOthers,
          bends: countOrthogonalBends(candidate, EPS_LOCAL),
          totalBends: countOrthogonalBends(candidate),
          length: pathLength(candidate),
        };
      })
      .filter(({ crossings }) => crossings <= current.count)
      .sort((a, b) => a.crossings - b.crossings || a.bends - b.bends || a.length - b.length);
    return candidates.slice(0, MAX_PAIR_CANDIDATES_PER_EDGE).map((candidate) => {
      return {
        path: candidate.candidate,
        segments: candidate.candidateSegments,
        sharedTrackConflicts: sharedTrackConflictsFor(
          edge,
          candidate.candidate,
          candidate.candidateSegments,
          2
        ),
        crossingsWithOthers: candidate.crossingsWithOthers,
        totalBends: candidate.totalBends,
        length: candidate.length,
      };
    });
  };

  const conflictsOnlyWith = (candidate: PairCandidate, edge: MaterializedEdge): boolean => {
    for (const conflict of candidate.sharedTrackConflicts) {
      if (conflict !== edge) {
        return false;
      }
    }
    return true;
  };

  /**
   * For each candidate of `option`, what it crosses when `partner` is rerouted too: its
   * crossings with every edge but its own and `partner`. Undefined for a candidate that
   * shares a track with an edge other than `partner`, which no pairing with `partner` takes.
   */
  const remainingCrossings = (
    option: PairOption,
    partner: MaterializedEdge
  ): (number | undefined)[] => {
    const partnerSegments = baseSegmentsFor(partner);
    return option.candidates.map((candidate) =>
      conflictsOnlyWith(candidate, partner)
        ? candidate.crossingsWithOthers -
          crossingCountBetweenSegments(candidate.segments, partnerSegments)
        : undefined
    );
  };

  const candidateShape = (candidate: PairCandidate): RouteShape =>
    (candidate.shape ??= routeShape(candidate.path, candidate.segments));

  const candidatesShareTrack = (
    firstCandidate: PairCandidate,
    secondCandidate: PairCandidate
  ): boolean =>
    firstCandidate.segments.some((firstSegment) =>
      secondCandidate.segments.some(
        (secondSegment) =>
          sameAxisSegmentOverlapLength(firstSegment, secondSegment, 0.5) >= MIN_SHARED
      )
    ) ||
    shapesTouchAtBend(
      candidateShape(firstCandidate),
      candidateShape(secondCandidate),
      EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE
    );

  const scorePairReplacement = (
    context: PairScoringContext,
    first: PairOption,
    firstCandidate: PairCandidate,
    second: PairOption,
    secondCandidate: PairCandidate,
    crossings: number
  ): PairReplacementScore | undefined => {
    if (crossings >= context.current.count) {
      return undefined;
    }

    return {
      replacements: new Map<MaterializedEdge, PointLite[]>([
        [first.edge, firstCandidate.path],
        [second.edge, secondCandidate.path],
      ]),
      crossings,
      bends:
        context.currentBends -
        (context.baseBendsByEdge.get(first.edge) ?? 0) -
        (context.baseBendsByEdge.get(second.edge) ?? 0) +
        firstCandidate.totalBends +
        secondCandidate.totalBends,
      length:
        context.currentLength -
        (context.baseLengthByEdge.get(first.edge) ?? 0) -
        (context.baseLengthByEdge.get(second.edge) ?? 0) +
        firstCandidate.length +
        secondCandidate.length,
    };
  };

  const pairScoreIsBetter = (
    candidate: PairReplacementScore,
    best: PairReplacementScore
  ): boolean =>
    candidate.crossings < best.crossings ||
    (candidate.crossings === best.crossings &&
      (candidate.bends < best.bends ||
        (candidate.bends === best.bends && candidate.length < best.length)));

  const bestScoreForOptionPair = (
    context: PairScoringContext,
    first: PairOption,
    second: PairOption,
    best: PairReplacementScore
  ): PairReplacementScore => {
    const { current, crossingCountByEdge } = context;
    // The crossings neither edge of the pair has a part in.
    const settled =
      current.count -
      (crossingCountByEdge.get(first.edge) ?? 0) -
      (crossingCountByEdge.get(second.edge) ?? 0) +
      (context.pairCounts.get(first.edge)?.get(second.edge) ?? 0);
    const firstRemaining = remainingCrossings(first, second.edge);
    const secondRemaining = remainingCrossings(second, first.edge);

    let pairBest = best;
    for (const [i, firstCandidate] of first.candidates.entries()) {
      const firstCrossings = firstRemaining[i];
      if (firstCrossings === undefined) {
        continue;
      }
      for (const [j, secondCandidate] of second.candidates.entries()) {
        const secondCrossings = secondRemaining[j];
        if (secondCrossings === undefined) {
          continue;
        }
        // The pair's crossings with each other only add to this.
        const floor = settled + firstCrossings + secondCrossings;
        if (floor >= current.count || floor > pairBest.crossings) {
          continue;
        }
        const score = scorePairReplacement(
          context,
          first,
          firstCandidate,
          second,
          secondCandidate,
          floor + crossingCountBetweenSegments(firstCandidate.segments, secondCandidate.segments)
        );
        if (
          score &&
          pairScoreIsBetter(score, pairBest) &&
          !candidatesShareTrack(firstCandidate, secondCandidate)
        ) {
          pairBest = score;
        }
      }
    }
    return pairBest;
  };

  const bestPairedReplacement = (current: CrossingSnapshot): EdgeReplacementMap | undefined => {
    const currentBends = totalBends();
    const currentLength = totalLength();
    const crossingCountByEdge = currentCrossingsByEdge(current);
    const baseBendsByEdge = new Map(
      visibleEdges.map((edge) => [edge, countOrthogonalBends(basePointsFor(edge))] as const)
    );
    const baseLengthByEdge = new Map(
      visibleEdges.map((edge) => [edge, pathLength(basePointsFor(edge))] as const)
    );
    const pairCounts = new Map<MaterializedEdge, Map<MaterializedEdge, number>>();
    for (const { first, second, count } of current.pairs) {
      for (const [one, other] of [
        [first, second],
        [second, first],
      ] as const) {
        const counts = pairCounts.get(one) ?? new Map<MaterializedEdge, number>();
        counts.set(other, count);
        pairCounts.set(one, counts);
      }
    }
    const optionsByEdge = new Map<MaterializedEdge, PairOption>();
    const groups = pairSearchGroups(current);
    for (const group of groups) {
      for (const edge of group) {
        if (optionsByEdge.has(edge)) {
          continue;
        }
        const candidates = pairCandidatesFor(edge, current, crossingCountByEdge);
        if (candidates.length > 0) {
          optionsByEdge.set(edge, { edge, candidates });
        }
      }
    }

    let best: PairReplacementScore = {
      replacements: new Map(),
      crossings: current.count,
      bends: currentBends,
      length: currentLength,
    };
    const scoringContext: PairScoringContext = {
      current,
      currentBends,
      currentLength,
      baseBendsByEdge,
      baseLengthByEdge,
      crossingCountByEdge,
      pairCounts,
    };

    for (const group of groups) {
      const crossingEdgeSet = new Set(group.filter((edge) => current.edgeSet.has(edge)));
      const options = group
        .map((edge) => optionsByEdge.get(edge))
        .filter((option): option is PairOption => Boolean(option));
      for (let i = 0; i < options.length; i++) {
        const first = options[i]!;
        for (let j = i + 1; j < options.length; j++) {
          const second = options[j]!;
          if (!crossingEdgeSet.has(first.edge) && !crossingEdgeSet.has(second.edge)) {
            continue;
          }
          best = bestScoreForOptionPair(scoringContext, first, second, best);
        }
      }
    }

    return best.replacements.size > 0 ? best.replacements : undefined;
  };

  // v13 (#683): the reroutes below save crossings without asking whether a route leaves its
  // lane. An edge whose ends share a lane, and whose route then leaves it, is put back on its best
  // route inside the lane: the cause and the rules v12 found in mermaid-js/mermaid#8698.
  const laneModel = buildLaneModel([...nodeByIdMap.values()]);

  // A lane's own outer tracks run just outside the nodes it holds, inside its box. A lane that
  // holds no node has none.
  const laneTracks = (band: RectLite): Record<RectSide, number> | undefined => {
    const inside = realNodes.filter((node) => staysInsideBand([{ x: node.cx, y: node.cy }], band));
    if (inside.length === 0) {
      return undefined;
    }
    return {
      top: Math.min(...inside.map((node) => node.rect.top)) - ANCHOR,
      bottom: Math.max(...inside.map((node) => node.rect.bottom)) + ANCHOR,
      left: Math.min(...inside.map((node) => node.rect.left)) - ANCHOR,
      right: Math.max(...inside.map((node) => node.rect.right)) + ANCHOR,
    };
  };

  /** An edge's candidates on `tracks`, built afresh: `sideCandidatesFor` keeps the outer ones. */
  const candidatePathsOnTracks = (
    edge: MaterializedEdge,
    tracks: Record<RectSide, number>
  ): PointLite[][] => {
    const srcNode = edge.start ? nodeInfoById.get(edge.start) : undefined;
    const dstNode = edge.end ? nodeInfoById.get(edge.end) : undefined;
    if (!srcNode || !dstNode) {
      return [];
    }
    activeTracks = tracks;
    try {
      const paths = sides.flatMap((srcSide) =>
        sides.flatMap((dstSide) =>
          buildCandidatesForSides(
            portForRectSide(srcNode, srcSide),
            srcSide,
            portForRectSide(dstNode, dstSide),
            dstSide
          )
        )
      );
      return [...paths, ...terminalPreservingOuterTrackCandidates(edge)];
    } finally {
      activeTracks = outsideTracks;
    }
  };

  // Whether a route runs through the box it starts or ends at, instead of only touching it.
  const pathEntersItsEnds = (edge: MaterializedEdge, pathSegments: SegmentLite[]): boolean => {
    const ends = endpointIdsFor(edge);
    const rects = realNodeRects.filter((entry) => ends.includes(entry.id));
    return pathSegments.some((segment) => segmentHitsAnyRect(segment.a, segment.b, rects, [], 2));
  };

  // How many crossings of `path` with the other edges sit so close to an end of either route
  // that the hop drawn there would run into the arrowhead.
  const crossingsNearTips = (edge: MaterializedEdge, path: PointLite[]): number => {
    let count = 0;
    for (const other of visibleEdges) {
      if (other === edge) {
        continue;
      }
      const otherPath = basePointsFor(other);
      const tips = [path[0], path.at(-1), otherPath[0], otherPath.at(-1)];
      count += crossingPointsBetween(path, otherPath).filter((point) =>
        tips.some(
          (tip) =>
            tip !== undefined &&
            Math.hypot(tip.x - point.x, tip.y - point.y) < EDGE_ROUTING.TERMINAL_HOP_CLEARANCE
        )
      ).length;
    }
    return count;
  };

  // The routes of `edge` that stay in `band`, hops included, and are clear: those on the
  // diagram's outer tracks, those on the lane's own, and the route the edge had before this pass.
  const inLaneCandidatesFor = (edge: MaterializedEdge, band: RectLite): PointLite[][] => {
    const tracks = laneTracks(band);
    const paths = [
      ...candidatesFor(edge).map((candidate) => candidate.path),
      ...(tracks ? candidatePathsOnTracks(edge, tracks) : []),
      routedBefore.get(edge) ?? [],
    ];
    const others = visibleEdges.filter((other) => other !== edge).map(basePointsFor);
    return paths
      .map((path) => simplifyPolyline(dedupeConsecutivePoints(path)))
      .filter(
        (path) =>
          path.length >= 2 &&
          staysInsideBand(path, band) &&
          hopsStayInsideBand(path, others, band, EDGE_ROUTING.LINE_HOP_RADIUS)
      )
      .filter((path) => {
        const pathSegments = segmentsFor(path);
        return (
          !pathHitsNode(edge, pathSegments) &&
          !pathEntersItsEnds(edge, pathSegments) &&
          sharedTrackConflictsFor(edge, path, pathSegments, 1).size === 0
        );
      });
  };

  // Of the in-lane routes with no hop under an arrowhead, the one with the fewest crossings, then
  // the fewest bends, then the shortest. None when every one has such a hop.
  const bestInLaneCandidate = (edge: MaterializedEdge, band: RectLite): PointLite[] | undefined => {
    let best: { path: PointLite[]; score: number[] } | undefined;
    for (const path of inLaneCandidatesFor(edge, band)) {
      if (crossingsNearTips(edge, path) > 0) {
        continue;
      }
      const score = [
        crossingsWithOtherEdges(edge, segmentsFor(path)),
        countOrthogonalBends(path, EPS_LOCAL),
        pathLength(path),
      ];
      const differs = best ? score.findIndex((value, i) => value !== best!.score[i]) : -1;
      if (!best || (differs >= 0 && score[differs]! < best.score[differs]!)) {
        best = { path, score };
      }
    }
    return best?.path;
  };

  // An edge whose ends share a lane, routed out of it, goes back on its best in-lane route. An
  // edge with none keeps the route it has; no other edge moves.
  const keepSameLaneEdgesInside = (): void => {
    for (const edge of visibleEdges) {
      const band = sharedLaneBand(edge, laneModel, nodeByIdMap);
      if (!band || staysInsideBand(edge.points ?? [], band)) {
        continue;
      }
      round = startRound();
      const best = bestInLaneCandidate(edge, band);
      if (best) {
        edge.points = best.map((point) => ({ ...point }));
      }
    }
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    round = startRound();
    const current = crossingSnapshot();
    const currentCrossings = current.count;
    if (currentCrossings === 0) {
      break;
    }
    const crossingCountByEdge = currentCrossingsByEdge(current);

    let bestEdge: { points?: PointLite[] } | undefined;
    let bestPath: PointLite[] | undefined;
    let bestCrossings = currentCrossings;
    let bestBends = Number.POSITIVE_INFINITY;

    for (const edge of current.edges) {
      const currentEdgeBends = countOrthogonalBends(basePointsFor(edge), EPS_LOCAL);
      const settled = currentCrossings - (crossingCountByEdge.get(edge) ?? 0);
      for (const { path: candidate, rerouted, bends: candidateBends } of candidatesFor(edge)) {
        // v13 (#687): a candidate is tested against the nodes and the other routes only once
        // its counts would make it the best so far; the tests do not depend on each other.
        // v13 (#843): nor are its crossings counted past the most that could make it so.
        const allowed = (candidateBends < bestBends ? bestCrossings : bestCrossings - 1) - settled;
        const withOthers = crossingsWithOtherEdgesUpTo(edge, rerouted, allowed);
        if (withOthers > allowed) {
          continue;
        }
        const candidateCrossings = settled + withOthers;
        const improvesCurrentEdge =
          candidateCrossings < currentCrossings ||
          (candidateCrossings === currentCrossings && candidateBends < currentEdgeBends);
        if (!improvesCurrentEdge) {
          continue;
        }
        if (
          candidateCrossings > bestCrossings ||
          (candidateCrossings === bestCrossings && candidateBends >= bestBends)
        ) {
          continue;
        }
        const candidateSegments = segmentsFor(candidate);
        if (
          pathHitsNode(edge, candidateSegments) ||
          sharedTrackConflictsFor(edge, candidate, candidateSegments, 1).size > 0
        ) {
          continue;
        }
        bestEdge = edge;
        bestPath = candidate;
        bestCrossings = candidateCrossings;
        bestBends = candidateBends;
      }
    }

    if (bestEdge && bestPath) {
      // A copy: edges between the same two nodes share their candidates.
      bestEdge.points = bestPath.map((point) => ({ ...point }));
      continue;
    }

    const pairedReplacement = bestPairedReplacement(current);
    if (!pairedReplacement) {
      break;
    }
    for (const [edge, points] of pairedReplacement) {
      (edge as { points: PointLite[] }).points = points;
    }
  }

  keepSameLaneEdgesInside();
}
