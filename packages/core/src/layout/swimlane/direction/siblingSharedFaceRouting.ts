// Ported from v12 `swimlanes/direction/siblingSharedFaceRouting.ts` at upstream `c9b12739f` (D532).
// Changed: types tightened for `noUncheckedIndexedAccess`; v12 `Edge`/`Node` are the engine's
// `layoutData.ts` types; a line rescued beside another edge between the same two nodes keeps an
// arrowhead spacing from it (#683, the cause mermaid-js/mermaid#8407 found).
// cspell:ignore Hegemann Kandinsky Siebenhaller
import type { Edge, Node } from '../layoutData.ts';
import { EDGE_ROUTING } from '../config.ts';
import {
  classifyThreeSegmentRoute,
  collectRealNodeBounds,
  getNodePairGeometry,
  routesTouchAtBend,
  segmentConflictsWithAnyEdge,
  segmentHitsAnyRect,
} from './geometry.ts';

const EPS = 1e-6;
const MIN_PORT_SPACING = 8;
const PORT_SHIFT = MIN_PORT_SPACING / 2;
/**
 * Shift for a line rescued beside another edge between the same two nodes. One of the pair ends
 * in an arrowhead next to the other's line, so it keeps the spacing `crowdsFaceNeighbour` asks of
 * two ends on one face.
 */
const PAIR_SIBLING_SHIFT = EDGE_ROUTING.MIN_ARROWHEAD_SPACING;
const LABEL_CLEARANCE_BUFFER = 3;
/**
 * The shifts that clear what a rescued line can sit beside, which `PORT_SHIFT` alone is under: a
 * corner of another route (the gap a reader can see between two strokes), then an arrowhead on
 * the same face.
 */
const CLEAR_SHIFTS = [EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE, EDGE_ROUTING.MIN_ARROWHEAD_SPACING];

interface PointLite {
  x: number;
  y: number;
}

interface LabelDim {
  w: number;
  h: number;
}

/**
 * True when another edge already ends or starts on the same face of `nodeId`
 * within an arrowhead of `end`. `axis` runs along the face.
 */
function crowdsFaceNeighbour(
  edges: Edge[],
  edge: Edge,
  nodeId: string,
  { cx, cy }: { cx: number; cy: number },
  end: PointLite,
  axis: 'x' | 'y'
): boolean {
  const centre = { x: cx, y: cy };
  const across = axis === 'x' ? 'y' : 'x';
  const faceSide = Math.sign(end[across] - centre[across]);
  for (const other of edges) {
    if (other === edge || other.isLayoutOnly || !other.points?.length) {
      continue;
    }
    const attached = [
      ...(other.end === nodeId ? [other.points.at(-1)!] : []),
      ...(other.start === nodeId ? [other.points[0]!] : []),
    ];
    if (
      attached.some(
        (p) =>
          Math.sign(p[across] - centre[across]) === faceSide &&
          Math.abs(p[axis] - end[axis]) < EDGE_ROUTING.MIN_ARROWHEAD_SPACING - EPS
      )
    ) {
      return true;
    }
  }
  return false;
}

/** True when a corner of another edge's route lies within the visible gap of `line`. */
function touchesCornerOfAnotherRoute(edges: Edge[], edge: Edge, line: PointLite[]): boolean {
  return edges.some(
    (other) =>
      other !== edge &&
      !other.isLayoutOnly &&
      Boolean(other.points?.length) &&
      routesTouchAtBend(line, other.points!, EDGE_ROUTING.ROUTE_TOUCH_TOLERANCE)
  );
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

interface RescueContext {
  nodePair: NonNullable<ReturnType<typeof getNodePairGeometry>>;
  targetSrc: PointLite;
  targetDst: PointLite;
  deltas: number[];
  shiftAxis: 'x' | 'y';
  realNodeRects: Parameters<typeof segmentHitsAnyRect>[2];
}

/**
 * The shifts to try, in order. A shift under the visible gap leaves the line touching a corner of
 * a route that leaves the same face, and one under an arrowhead spacing leaves it beside that
 * route's arrowhead; the next shifts out clear them, where the face has room.
 */
function shiftDeltas(effectiveShift: number): number[] {
  const shifts = new Set([effectiveShift, ...CLEAR_SHIFTS.map((s) => Math.max(s, effectiveShift))]);
  return [0, ...[...shifts].flatMap((shift) => [shift, -shift])];
}

/** True when a line shifted along `axis` stays inside the span of both end faces. */
function staysOnFaces(ctx: RescueContext, src: PointLite, dst: PointLite): boolean {
  const { srcInfo, dstInfo } = ctx.nodePair;
  const [lo, hi] =
    ctx.shiftAxis === 'x' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
  const on = (p: PointLite, r: typeof srcInfo.rect): boolean =>
    p[ctx.shiftAxis] > r[lo] && p[ctx.shiftAxis] < r[hi];
  return on(src, srcInfo.rect) && on(dst, dstInfo.rect);
}

/**
 * The straight line for the first shift that clears every node and edge, preferring one that
 * keeps clear of a sibling's arrowhead and of a corner of another route; a line that does not is
 * the last resort.
 */
function rescueLine(edges: Edge[], edge: Edge, ctx: RescueContext): PointLite[] | undefined {
  const { srcId, dstId, srcInfo, dstInfo } = ctx.nodePair;
  let crowded: PointLite[] | undefined;
  for (const delta of ctx.deltas) {
    const src = { ...ctx.targetSrc, [ctx.shiftAxis]: ctx.targetSrc[ctx.shiftAxis] + delta };
    const dst = { ...ctx.targetDst, [ctx.shiftAxis]: ctx.targetDst[ctx.shiftAxis] + delta };
    if (
      !staysOnFaces(ctx, src, dst) ||
      segmentHitsAnyRect(src, dst, ctx.realNodeRects, [srcId, dstId], 1) ||
      segmentConflictsWithAnyEdge(src, dst, edges, edge, { epsilon: EPS })
    ) {
      continue;
    }
    const rescued = [src, dst];
    if (
      crowdsFaceNeighbour(edges, edge, srcId, srcInfo, src, ctx.shiftAxis) ||
      crowdsFaceNeighbour(edges, edge, dstId, dstInfo, dst, ctx.shiftAxis) ||
      touchesCornerOfAnotherRoute(edges, edge, rescued)
    ) {
      crowded ??= rescued;
      continue;
    }
    return rescued;
  }
  return crowded;
}

/**
 * Iter 12 — co-route sibling straight-line rescue.
 *
 * Fires only on the narrow "4-point U-detour around a collinear blocker
 * where the obvious straight line is geometrically clear" shape. For each
 * eligible edge, shifts the source and destination attach points by
 * PORT_SHIFT along the shared face (PAIR_SIBLING_SHIFT beside another edge
 * between the same two nodes, more to clear a label) and replaces the polyline
 * with a 2-point straight line. The shift direction is chosen by trying
 * both +delta and -delta and picking whichever doesn't introduce a new
 * edge crossing or leave the node's face span.
 *
 * Paper backing: Hegemann & Wolff "On the smoothing of orthogonal
 * connector layouts" (NotebookLM src b65b3d45) §4.2 / Fig. 11 —
 * joint-feasibility via port distribution rather than face exclusion.
 * Mermaid-specific narrowing: we only rescue the exact 4-point shape to
 * minimize blast radius.
 */
export function straightenCollinearSiblingDetours(edges: Edge[], nodes: Node[]): void {
  const { nodeInfoById, realNodeRects } = collectRealNodeBounds(nodes);
  // Side table of label-node dimensions so we can grow the rescue delta
  // far enough to clear a label sitting on the sibling line.
  const labelDimById = new Map<string, LabelDim>();
  for (const n of nodes) {
    const id = n.id;
    if (n.isGroup) {
      continue;
    }
    if (n.isEdgeLabel) {
      labelDimById.set(id, {
        w: n.width ?? 0,
        h: n.height ?? 0,
      });
    }
  }

  // The other edges joining the same two nodes as `thisEdge`, in either direction.
  const pairSiblingsOf = (thisEdge: Edge, thisSrcId: string, thisDstId: string): Edge[] => {
    const targetPair = pairKey(thisSrcId, thisDstId);
    return edges.filter(
      (other) =>
        other !== thisEdge &&
        !other.isLayoutOnly &&
        other.start &&
        other.end &&
        pairKey(other.start, other.end) === targetPair
    );
  };

  // The largest label half-extent along `axis` among this edge and its pair
  // siblings. Used to grow the rescue shift past the label so
  // anchorLabelsToPolyline can place the label clear of the sibling.
  const labelClearanceFor = (thisEdge: Edge, siblings: Edge[], axis: 'x' | 'y'): number => {
    let maxHalf = 0;
    for (const { labelNodeId } of [thisEdge, ...siblings]) {
      const dim = labelNodeId ? labelDimById.get(labelNodeId) : undefined;
      if (dim) {
        maxHalf = Math.max(maxHalf, axis === 'x' ? dim.w / 2 : dim.h / 2);
      }
    }
    return maxHalf > 0 ? maxHalf + LABEL_CLEARANCE_BUFFER : 0;
  };

  for (const edge of edges) {
    if (edge.isLayoutOnly) {
      continue;
    }
    const pts = edge.points;
    if (!classifyThreeSegmentRoute(pts, EPS)) {
      continue;
    }

    const nodePair = getNodePairGeometry(edge, nodeInfoById, EPS);
    if (!nodePair) {
      continue;
    }
    const { srcId, dstId, srcInfo, dstInfo, collinearX, collinearY } = nodePair;
    if (collinearX === collinearY) {
      continue;
    }

    let targetSrc: PointLite;
    let targetDst: PointLite;
    if (collinearX) {
      const dstBelow = dstInfo.cy > srcInfo.cy;
      targetSrc = { x: srcInfo.cx, y: dstBelow ? srcInfo.rect.bottom : srcInfo.rect.top };
      targetDst = { x: dstInfo.cx, y: dstBelow ? dstInfo.rect.top : dstInfo.rect.bottom };
    } else {
      const dstEast = dstInfo.cx > srcInfo.cx;
      targetSrc = { x: dstEast ? srcInfo.rect.right : srcInfo.rect.left, y: srcInfo.cy };
      targetDst = { x: dstEast ? dstInfo.rect.left : dstInfo.rect.right, y: dstInfo.cy };
    }

    if (segmentHitsAnyRect(targetSrc, targetDst, realNodeRects, [srcId, dstId], 1)) {
      continue;
    }

    // The rescue moves the line perpendicular to its own direction: a
    // horizontal rescued line shifts in y (so the label HEIGHT determines
    // clearance), a vertical one shifts in x (label WIDTH). collinearX
    // means the rescued line is vertical (nodes share a column).
    //
    // Beside another edge between the same two nodes, the shift is at least
    // PAIR_SIBLING_SHIFT so the arrowhead of either clears the other's line.
    // When the edge (or such a sibling) carries a label, the shift grows to
    // clear the label rect too, or the label would overlap this line. If the
    // wider shift won't fit on the node face, the bounds check below rejects
    // it and we fall through without rescuing, which keeps the original
    // 4-point detour, clear of both the sibling and its label.
    const shiftAxis: 'x' | 'y' = collinearX ? 'x' : 'y';
    const siblings = pairSiblingsOf(edge, srcId, dstId);
    const labelShift = labelClearanceFor(edge, siblings, shiftAxis);
    const effectiveShift = Math.max(
      labelShift,
      siblings.length > 0 ? PAIR_SIBLING_SHIFT : PORT_SHIFT
    );
    const rescued = rescueLine(edges, edge, {
      nodePair,
      targetSrc,
      targetDst,
      deltas: shiftDeltas(effectiveShift),
      shiftAxis,
      realNodeRects,
    });
    if (rescued) {
      edge.points = rescued;
    }
  }
}
