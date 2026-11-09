/**
 * Edge ends on shape outlines. An engine ends a route on the side of a node's layout box; the
 * drawn shape (a diamond, a slanted input, a wave-bottomed refdoc, a rounded corner) sits inside
 * that box, so each end moves straight in from the side until it meets the outline (flowchart
 * does the same at draw time; agentflow does it once, in the layout, so every consumer of the
 * layout gets ends on the outline). An end that meets no outline that way goes to the outline's
 * nearest point.
 */
import type { LayoutModelNode, Point, RoutePoint } from '@mermaid-js/core/layout';

/** Where the ray `o + k d` (k ≥ 0) first meets the closed polygon `poly`, if it does. */
function firstHit(o: Point, d: Point, poly: readonly Point[]): Point | undefined {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = d.x * ey - d.y * ex;
    if (den === 0) continue;
    const ax = a.x - o.x;
    const ay = a.y - o.y;
    const k = (ax * ey - ay * ex) / den;
    const s = (ax * d.y - ay * d.x) / den;
    if (k >= 0 && s >= 0 && s <= 1 && k < best) best = k;
  }
  return best === Infinity ? undefined : { x: o.x + best * d.x, y: o.y + best * d.y };
}

/** The point of segment `ab` nearest to `p`. */
function nearestOnSegment(p: Point, a: Point, b: Point): Point {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = ex * ex + ey * ey;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len));
  return { x: a.x + t * ex, y: a.y + t * ey };
}

/** The point of the closed polygon `poly`'s boundary nearest to `p`. */
export function nearestOnOutline(p: Point, poly: readonly Point[]): Point {
  let best = p;
  let dist = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const q = nearestOnSegment(p, poly[i]!, poly[(i + 1) % poly.length]!);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < dist) {
      dist = d;
      best = q;
    }
  }
  return best;
}

/** How far `p` is from the closed polygon `poly`'s boundary. */
export function outlineDistance(p: Point, poly: readonly Point[]): number {
  const q = nearestOnOutline(p, poly);
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/**
 * `p` (a route end on `box`, `next` the route's next point other than `p`, if any) moved onto `outline` (in the shape's
 * own frame, centred on the box): from a side (within `onSide`) straight in; from inside the
 * box (an engine routes an edge to a frame around its own end from the end's centre) along the
 * route to where it leaves the outline. Any other point is left where it is.
 */
export function endOnOutline(
  p: RoutePoint,
  next: Point | undefined,
  box: LayoutModelNode,
  outline: readonly Point[],
  onSide: number
): RoutePoint {
  const local = { x: p.x - box.x, y: p.y - box.y };
  const hw = box.width / 2;
  const hh = box.height / 2;
  let at: Point | undefined;
  if (Math.abs(Math.abs(local.y) - hh) < onSide && Math.abs(local.x) <= hw + onSide) {
    const dy = local.y < 0 ? 1 : -1;
    // From just outside the side, so an end a hair inside it still meets the near side first.
    at = firstHit({ x: local.x, y: -dy * (hh + onSide) }, { x: 0, y: dy }, outline);
  } else if (Math.abs(Math.abs(local.x) - hw) < onSide && Math.abs(local.y) <= hh + onSide) {
    const dx = local.x < 0 ? 1 : -1;
    at = firstHit({ x: -dx * (hw + onSide), y: local.y }, { x: dx, y: 0 }, outline);
  } else if (Math.abs(local.x) < hw && Math.abs(local.y) < hh) {
    const d = next ? { x: next.x - p.x, y: next.y - p.y } : { x: 0, y: 0 };
    const len = Math.hypot(d.x, d.y);
    // A route that does not move (to a frame centred on its end) leaves by the nearest side.
    if (len > 0) at = firstHit(local, { x: d.x / len, y: d.y / len }, outline);
  } else {
    return p;
  }
  at ??= nearestOnOutline(local, outline);
  return { ...p, x: at.x + box.x, y: at.y + box.y };
}
