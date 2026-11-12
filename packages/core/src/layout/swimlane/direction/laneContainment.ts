// v13 (#683): an edge whose two ends sit in one lane stays inside that lane. The geometry the
// crossing cleanup (`resolveRenderedOrthogonalCrossings`) needs for it, after the cause and the
// rules v12 found for it in mermaid-js/mermaid#8698.
import type { Node } from '../layoutData.ts';
import type { LaneModel } from '../lanes.ts';
import { rectOfNodeBounds } from './geometry.ts';
import type { Point, RectBounds } from './geometry.ts';

/** How far a route may stray past its lane's border and still count as inside it (px). */
const BAND_TOLERANCE = 0.5;

/** The ends of an edge, as `sharedLaneBand` reads them. */
export interface LaneEdge {
  start?: string;
  end?: string;
}

/**
 * The box of the lane both ends of `edge` sit in, or `undefined` when they sit in different
 * lanes, outside any lane, or in a lane without a laid-out box.
 */
export function sharedLaneBand(
  edge: LaneEdge,
  laneModel: LaneModel,
  nodeByIdMap: ReadonlyMap<string, Node>
): RectBounds | undefined {
  const startLane = edge.start ? laneModel.laneIdOf(edge.start) : null;
  const endLane = edge.end ? laneModel.laneIdOf(edge.end) : null;
  if (!startLane || startLane !== endLane) {
    return undefined;
  }
  const lane = nodeByIdMap.get(startLane);
  return lane ? rectOfNodeBounds(lane) : undefined;
}

/** Whether every point of `points` lies inside `band`. */
export function staysInsideBand(points: readonly Point[], band: RectBounds): boolean {
  return points.every(
    (point) =>
      point.x >= band.left - BAND_TOLERANCE &&
      point.x <= band.right + BAND_TOLERANCE &&
      point.y >= band.top - BAND_TOLERANCE &&
      point.y <= band.bottom + BAND_TOLERANCE
  );
}

const isFlat = (a: Point, b: Point): boolean => Math.abs(a.y - b.y) < BAND_TOLERANCE;
const isUpright = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < BAND_TOLERANCE;
const strictlyBetween = (value: number, a: number, b: number): boolean =>
  value > Math.min(a, b) + BAND_TOLERANCE && value < Math.max(a, b) - BAND_TOLERANCE;

/** Where a horizontal and a vertical segment cross each other away from their ends, if they do. */
function crossingOf(flat: [Point, Point], upright: [Point, Point]): Point | undefined {
  const x = upright[0].x;
  const y = flat[0].y;
  return strictlyBetween(x, flat[0].x, flat[1].x) && strictlyBetween(y, upright[0].y, upright[1].y)
    ? { x, y }
    : undefined;
}

/** Whether the horizontal segment `flat` crosses a vertical segment of any of `others`. */
const crossesUpright = (flat: [Point, Point], others: readonly (readonly Point[])[]): boolean =>
  others.some((other) =>
    other.some(
      (point, j) =>
        j > 0 &&
        isUpright(other[j - 1]!, point) &&
        crossingOf(flat, [other[j - 1]!, point]) !== undefined
    )
  );

/**
 * Whether every hop `route` draws over `others` stays inside `band`. A hop of `hopRadius` is drawn
 * on a horizontal segment where it crosses a vertical one, rising above the segment's row; a
 * vertical segment never hops over a horizontal one (D537).
 */
export function hopsStayInsideBand(
  route: readonly Point[],
  others: readonly (readonly Point[])[],
  band: RectBounds,
  hopRadius: number
): boolean {
  for (let i = 0; i < route.length - 1; i++) {
    const flat: [Point, Point] = [route[i]!, route[i + 1]!];
    const hopTop = flat[0].y - hopRadius;
    if (isFlat(...flat) && hopTop < band.top - BAND_TOLERANCE && crossesUpright(flat, others)) {
      return false;
    }
  }
  return true;
}

/** Every point where a segment of route `a` crosses a segment of route `b` at a right angle. */
export function crossingPointsBetween(a: readonly Point[], b: readonly Point[]): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < b.length - 1; j++) {
      const first: [Point, Point] = [a[i]!, a[i + 1]!];
      const second: [Point, Point] = [b[j]!, b[j + 1]!];
      let hit: Point | undefined;
      if (isFlat(...first) && isUpright(...second)) {
        hit = crossingOf(first, second);
      } else if (isUpright(...first) && isFlat(...second)) {
        hit = crossingOf(second, first);
      }
      if (hit) {
        points.push(hit);
      }
    }
  }
  return points;
}
