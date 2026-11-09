// Route ends brought back onto their boxes (v13). v12 routes LR and RL in TB coordinates with the
// nodes' unturned sizes and turns the result, so a port on a node's side, or the router's anchor
// 20 off it, can land off the turned box; endpoint clipping only moves ends that lie inside a box
// or on a segment into it, so a few ends stay in mid-air (`pebr-2-edge-intrudes-lane-label`,
// `pipeline.hoe.lr.spec.ts`). v12's renderer clipped to the shape anyway; v13's model needs every
// route to start and end on its boxes. An end off its box gets a stub from the box's side facing
// it, straight out to it, or the end slides along its own leg onto the side when that leg runs at
// the box head-on.
import type { LayoutData, Node } from './layoutData.ts';

interface Pt {
  x: number;
  y: number;
}

/** How far off its box an end may be and still count as on it. */
const ON = 0.5;

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

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

/**
 * The route from `b` to the rest of `route` (whose first point is the loose end), or undefined
 * when the end is inside the box or level with neither of its spans (left alone).
 */
function reattach(route: Pt[], b: Box): Pt[] | undefined {
  const [p, q] = [
    route[0]!,
    route.find((r, i) => i > 0 && (r.x !== route[0]!.x || r.y !== route[0]!.y)),
  ];
  const inX = within(p.x, b.left, b.right);
  const inY = within(p.y, b.top, b.bottom);
  if (inX === inY) return undefined;
  if (inX) {
    const side = p.y < b.top ? b.top : b.bottom;
    // A vertical leg runs at the box head-on: slide its end onto the side.
    if (q && Math.abs(q.x - p.x) <= ON) return [{ x: p.x, y: side }, ...route.slice(1)];
    return [{ x: p.x, y: side }, ...route];
  }
  const side = p.x < b.left ? b.left : b.right;
  if (q && Math.abs(q.y - p.y) <= ON) return [{ x: side, y: p.y }, ...route.slice(1)];
  return [{ x: side, y: p.y }, ...route];
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
