// cspell:ignore pebr
// Route ends brought back onto their boxes (v13). v12 routes LR and RL in TB coordinates with the
// nodes' unturned sizes and turns the result, so a port on a node's side, or the router's anchor
// 20 off it, can land off the turned box; endpoint clipping only moves ends that lie inside a box
// or on a segment into it, so a few ends stay in mid-air. `turnedRouting.ts` removes the cause for
// the cases found (`pebr-2-edge-intrudes-lane-label`, `pipeline.hoe.lr.spec.ts`); this stays as
// the guarantee. v12's renderer clipped to the shape anyway; v13's model needs every
// route to start and end on its boxes, so an end off its box gets a stub from it (`reattach`).
import type { Box } from '../types.ts';
import type { LayoutData, Node } from './layoutData.ts';

interface Pt {
  x: number;
  y: number;
}

/** How far off its box an end may be and still count as on it. */
const ON = 0.5;

const boxOf = (n: Node): Box => {
  const [x, y, w, h] = [n.x ?? 0, n.y ?? 0, (n.width ?? 0) / 2, (n.height ?? 0) / 2];
  return { left: x - w, right: x + w, top: y - h, bottom: y + h };
};

const within = (v: number, lo: number, hi: number): boolean => v >= lo - ON && v <= hi + ON;

function onBoundary(p: Pt, b: Box): boolean {
  const inX = within(p.x, b.left, b.right);
  const inY = within(p.y, b.top, b.bottom);
  const onX = Math.abs(p.x - b.left) <= ON || Math.abs(p.x - b.right) <= ON;
  const onY = Math.abs(p.y - b.top) <= ON || Math.abs(p.y - b.bottom) <= ON;
  return (onX && inY) || (onY && inX);
}

/** How far a stub keeps from the box's corners. */
const CORNER = 4;

const clamp = (v: number, lo: number, hi: number): number =>
  lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));

/**
 * The route from `b` to the rest of `route` (whose first point is the loose end), or undefined
 * when the end lies inside the box (left alone). An end level with one of the box's spans gets
 * a straight stub from the facing side, or slides along its own leg onto that side when the leg
 * runs at the box head-on and moves away from it; an end past a corner gets a two-leg stub from
 * the nearer side.
 */
function reattach(route: Pt[], b: Box): Pt[] | undefined {
  const p = route[0]!;
  const q = route.find((r) => r.x !== p.x || r.y !== p.y);
  const inX = within(p.x, b.left, b.right);
  const inY = within(p.y, b.top, b.bottom);
  if (inX && inY) return undefined;
  if (inX) {
    const above = p.y < b.top;
    const side = above ? b.top : b.bottom;
    const away = q !== undefined && (above ? q.y <= p.y : q.y >= p.y);
    if (q && away && Math.abs(q.x - p.x) <= ON) return [{ x: p.x, y: side }, ...route.slice(1)];
    return [{ x: p.x, y: side }, ...route];
  }
  if (inY) {
    const before = p.x < b.left;
    const side = before ? b.left : b.right;
    const away = q !== undefined && (before ? q.x <= p.x : q.x >= p.x);
    if (q && away && Math.abs(q.y - p.y) <= ON) return [{ x: side, y: p.y }, ...route.slice(1)];
    return [{ x: side, y: p.y }, ...route];
  }
  // Past a corner: out of the top or bottom, square to it, then across to the end.
  const x = clamp(p.x, b.left + CORNER, b.right - CORNER);
  const side = p.y < b.top ? b.top : b.bottom;
  return [{ x, y: side }, { x, y: p.y }, ...route];
}

/** Puts every route end of `data` that lies off its box back on it (final coordinates). */
export function reattachTerminals(data: LayoutData): void {
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  for (const e of data.edges) {
    const pts = e.points;
    const src = byId.get(e.start);
    const dst = byId.get(e.end);
    if (e.isLayoutOnly || !pts || pts.length < 2 || !src || !dst) continue;
    let route = pts;
    if (!onBoundary(route[0]!, boxOf(src))) route = reattach(route, boxOf(src)) ?? route;
    if (!onBoundary(route.at(-1)!, boxOf(dst))) {
      const back = reattach([...route].reverse(), boxOf(dst));
      if (back) route = back.reverse();
    }
    if (route !== pts) e.points = route;
  }
}
