// Lanes grown around the routes (v13). v12 sizes lanes from their nodes before routing, with a
// margin of `max(padding, 10)`; v12's groups had 8 padding, so a rail the router or the crossing
// cleanup lays 20 outside the nodes ran past the lanes, in the drawing's margin. Flowchart's v13
// groups have 20 padding, which puts those rails on the lane border, where they hug it (D538).
// So once the routes are final, the lanes grow until every route keeps `MARGIN` inside them:
// all lanes along the flow (they share that extent; the title band stays at the start), and the
// first and last lane outward across it. Ends of edges that meet a lane move with its border.
import type { Edge, LayoutData, Node } from './layoutData.ts';
import { buildLaneModel } from './lanes.ts';

type Axis = 'x' | 'y';

/** Room kept between a route and a lane's outer border: v12's least lane margin. */
const MARGIN = 10;

interface Span {
  lo: number;
  hi: number;
}

const spanOf = (n: Node, axis: Axis): Span => {
  const half = ((axis === 'x' ? n.width : n.height) ?? 0) / 2;
  return { lo: (n[axis] ?? 0) - half, hi: (n[axis] ?? 0) + half };
};

/** Gives `lane` the span `to` along `axis`, moving its title band's side with it. */
function setSpan(lane: Node, axis: Axis, to: Span): void {
  const from = spanOf(lane, axis);
  lane[axis] = (to.lo + to.hi) / 2;
  if (axis === 'x') lane.width = to.hi - to.lo;
  else lane.height = to.hi - to.lo;
  const r = lane.groupTitleRect;
  if (!r) return;
  const [lo, hi] = axis === 'x' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
  // A band that spans the lane along `axis` follows both sides; one at the start moves with it.
  const spans = Math.abs(r[lo] - from.lo) < 0.5 && Math.abs(r[hi] - from.hi) < 0.5;
  const shift = to.lo - from.lo;
  lane.groupTitleRect = spans
    ? { ...r, [lo]: to.lo, [hi]: to.hi }
    : { ...r, [lo]: r[lo] + shift, [hi]: r[hi] + shift };
}

/** The route points that must stay inside the lanes: all but ends on a group's border. */
function routePoints(data: LayoutData, groups: ReadonlySet<string>): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const e of data.edges) {
    const pts = e.points ?? [];
    if (e.isLayoutOnly || pts.length < 2) continue;
    const from = groups.has(e.start) ? 1 : 0;
    const to = groups.has(e.end) ? pts.length - 1 : pts.length;
    out.push(...pts.slice(from, to));
  }
  return out;
}

/** Moves the ends of `edges` that lay on `lane`'s old side `at` along `axis` onto `to`. */
function followBorder(edges: Edge[], lane: Node, axis: Axis, at: number, to: number): void {
  for (const e of edges) {
    const pts = e.points;
    if (!pts || pts.length < 2) continue;
    for (const [end, next] of [
      [e.start === lane.id ? 0 : -1, 1],
      [e.end === lane.id ? pts.length - 1 : -1, pts.length - 2],
    ] as const) {
      const p = pts[end];
      if (!p || Math.abs(p[axis] - at) > 0.5) continue;
      const along =
        Math.abs(pts[next]![axis === 'x' ? 'y' : 'x'] - p[axis === 'x' ? 'y' : 'x']) < 0.5;
      const moved = { ...p, [axis]: to };
      if (along) pts[end] = moved;
      else if (end === 0) pts.unshift(moved);
      else pts.push(moved);
    }
  }
}

/** Grows the lanes of `data` (final coordinates) so every route keeps `MARGIN` inside them. */
export function fitLanesToRoutes(data: LayoutData): void {
  const laneModel = buildLaneModel(data.nodes);
  const lanes = data.nodes.filter(
    (n) => laneModel.isLane(n.id) && (n.width ?? 0) > 0 && (n.height ?? 0) > 0
  );
  if (lanes.length === 0) return;
  const groups = new Set(data.nodes.filter((n) => n.isGroup).map((n) => n.id));
  const points = routePoints(data, groups);
  if (points.length === 0) return;
  const sideways = data.direction === 'LR' || data.direction === 'RL';
  const flow: Axis = sideways ? 'x' : 'y';
  const cross: Axis = sideways ? 'y' : 'x';

  // Along the flow: every lane shares one extent; the title band stays at its start.
  const lo = Math.min(...lanes.map((l) => spanOf(l, flow).lo));
  const hi = Math.max(...lanes.map((l) => spanOf(l, flow).hi));
  const band = Math.max(
    0,
    ...lanes.map((l) => {
      const r = l.groupTitleRect;
      if (!r) return 0;
      return sideways ? r.right - r.left : r.bottom - r.top;
    })
  );
  const first = Math.min(...points.map((p) => p[flow]));
  const last = Math.max(...points.map((p) => p[flow]));
  const grown = { lo: Math.min(lo, first - MARGIN - band), hi: Math.max(hi, last + MARGIN) };
  if (grown.lo < lo || grown.hi > hi) {
    for (const lane of lanes) {
      const old = spanOf(lane, flow);
      setSpan(lane, flow, grown);
      followBorder(data.edges, lane, flow, old.lo, grown.lo);
      followBorder(data.edges, lane, flow, old.hi, grown.hi);
    }
  }

  // Across the flow: the outermost lanes grow outward.
  const ordered = [...lanes].sort((a, b) => (a[cross] ?? 0) - (b[cross] ?? 0));
  const near = ordered[0]!;
  const far = ordered.at(-1)!;
  const nearSpan = spanOf(near, cross);
  const low = Math.min(...points.map((p) => p[cross])) - MARGIN;
  if (low < nearSpan.lo) {
    setSpan(near, cross, { lo: low, hi: nearSpan.hi });
    followBorder(data.edges, near, cross, nearSpan.lo, low);
  }
  const farSpan = spanOf(far, cross);
  const high = Math.max(...points.map((p) => p[cross])) + MARGIN;
  if (high > farSpan.hi) {
    setSpan(far, cross, { lo: farSpan.lo, hi: high });
    followBorder(data.edges, far, cross, farSpan.hi, high);
  }
}
