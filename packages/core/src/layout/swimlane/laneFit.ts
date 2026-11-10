// Lanes grown around the routes (v13). v12 sizes lanes from their nodes before routing, with a
// margin of `max(padding, 10)`; v12's groups had 8 padding, so a rail the router or the crossing
// cleanup lays 20 outside the nodes ran past the lanes, in the drawing's margin. Flowchart's v13
// groups have 20 padding, which puts those rails on the lane border, where they hug it (D538).
// So once the routes are final, the lanes grow until every route keeps `MARGIN` inside them:
// all lanes along the flow (they share that extent; the title band stays at the start), and the
// first and last lane outward across it. Ends of edges that meet a lane move with its border.
import type { Edge, LayoutData, Node } from './layoutData.ts';
import { topLaneHorizontalPadding } from './helpers.ts';
import { buildLaneModel } from './lanes.ts';

type Axis = 'x' | 'y';

interface Pt {
  x: number;
  y: number;
}

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

const same = (a: Pt, b: Pt): boolean => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/**
 * What must stay inside the lanes: every route point but the ends on a group's border (with the
 * copies of them post-processing leaves for v12's renderer), and the corners of edge labels.
 */
function routePoints(data: LayoutData, groups: ReadonlySet<string>): Pt[] {
  const out: Pt[] = [];
  for (const e of data.edges) {
    const pts = e.points ?? [];
    if (e.isLayoutOnly || pts.length < 2) continue;
    let from = 0;
    let to = pts.length;
    if (groups.has(e.start)) while (from < to && same(pts[from]!, pts[0]!)) from++;
    if (groups.has(e.end)) while (to > from && same(pts[to - 1]!, pts.at(-1)!)) to--;
    out.push(...pts.slice(from, to));
  }
  for (const n of data.nodes) {
    if (!n.isEdgeLabel || n.x === undefined || n.y === undefined) continue;
    const [w, h] = [(n.width ?? 0) / 2, (n.height ?? 0) / 2];
    out.push({ x: n.x - w, y: n.y - h }, { x: n.x + w, y: n.y + h });
  }
  return out;
}

/** Moves one end of `pts` (and its copies) from `at` to `to` along `axis`, when it lies there. */
function moveEnd(pts: Pt[], atStart: boolean, axis: Axis, at: number, to: number): void {
  const route = atStart ? pts : pts.reverse();
  const end = route[0]!;
  if (Math.abs(end[axis] - at) > 0.5) {
    if (!atStart) pts.reverse();
    return;
  }
  let copies = 1;
  while (copies < route.length && same(route[copies]!, end)) copies++;
  const next = route[copies];
  const other: Axis = axis === 'x' ? 'y' : 'x';
  // A leg that runs along `axis` stretches to the new border; otherwise a stub joins it.
  const along = next !== undefined && Math.abs(next[other] - end[other]) < 0.5;
  const moved = { ...end, [axis]: to };
  if (along) route.splice(0, copies, moved);
  else route.unshift(moved);
  if (!atStart) pts.reverse();
}

/** Moves the ends of `edges` that lay on `lane`'s old side `at` along `axis` onto `to`. */
function followBorder(edges: Edge[], lane: Node, axis: Axis, at: number, to: number): void {
  for (const e of edges) {
    const pts = e.points;
    if (!pts || pts.length < 2) continue;
    if (e.start === lane.id) moveEnd(pts, true, axis, at, to);
    if (e.end === lane.id) moveEnd(pts, false, axis, at, to);
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

export const isPlaced = (n: Node): boolean => (n.width ?? 0) > 0 && (n.height ?? 0) > 0;

/**
 * Moves everything at or beyond `at` along `axis` on by `by`: boxes by centre (with their title
 * bands), and route points. Lanes not placed yet have no size to move.
 */
export function shiftBeyond(data: LayoutData, axis: Axis, at: number, by: number): void {
  for (const n of data.nodes) {
    const v = n[axis];
    if (v === undefined || v < at || (n.isGroup && !isPlaced(n))) continue;
    n[axis] = v + by;
    const r = n.groupTitleRect;
    if (r && axis === 'x') n.groupTitleRect = { ...r, left: r.left + by, right: r.right + by };
    if (r && axis === 'y') n.groupTitleRect = { ...r, top: r.top + by, bottom: r.bottom + by };
  }
  for (const e of data.edges) for (const p of e.points ?? []) if (p[axis] >= at) p[axis] += by;
}

/**
 * Widens each lane whose title is longer than the lane is across the flow (v13; v12 let the
 * title run past the lane): the lane grows to its title's width plus `topLaneHorizontalPadding`
 * each side. What lies inside it moves by half the growth, so its content stays centred, and
 * what lies beyond it by the whole; a point within 0.5 of a border counts as on it, as elsewhere
 * here (a route end on the near border stays, one on the far border moves with it). Routes are
 * right-angled, so the shift keeps them so.
 */
export function fitLanesToTitles(data: LayoutData): void {
  const laneModel = buildLaneModel(data.nodes);
  const sideways = data.direction === 'LR' || data.direction === 'RL';
  const cross: Axis = sideways ? 'y' : 'x';
  const lanes = data.nodes
    .filter((n) => laneModel.isLane(n.id) && n.titleSize && isPlaced(n))
    .sort((a, b) => (a[cross] ?? 0) - (b[cross] ?? 0));
  for (const lane of lanes) {
    const span = spanOf(lane, cross);
    const side = topLaneHorizontalPadding(lane);
    const grow = lane.titleSize!.width + 2 * side - (span.hi - span.lo);
    if (grow <= 0) continue;
    const [centre, rect] = [lane[cross], lane.groupTitleRect];
    shiftBeyond(data, cross, span.lo + 0.5, grow / 2);
    shiftBeyond(data, cross, span.hi + grow / 2 - 0.5, grow / 2);
    // The lane itself keeps its near border and grows at the far one.
    lane[cross] = centre;
    if (rect) lane.groupTitleRect = rect;
    setSpan(lane, cross, { lo: span.lo, hi: span.hi + grow });
  }
}
