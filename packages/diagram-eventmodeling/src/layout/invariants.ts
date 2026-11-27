/**
 * The event modeling layout's invariants (R-LAYOUT-3, spec #527 "Testing Decisions"): what every
 * `EventModelLayout` of a model must satisfy, whatever the measurer or the config. Returns one
 * message per broken rule; none for a sound layout. Checks:
 * - no NaN or infinite number anywhere;
 * - one box per frame, in frame order, and the lanes and relations `eventModelStructure` gives;
 * - no two boxes overlap; each box lies inside its lane;
 * - lanes never overlap and run top to bottom in index order;
 * - boxes' x order follows the frames' order;
 * - each relation starts on its source box's edge and ends on its target's, and a self loop's
 *   ends meet no other relation's;
 * - no relation enters a box other than its ends, so none strikes out a box's name or data, and
 *   no two relations share a run (D659; D743 adds the relations between lanes to the first);
 * - a relation within a lane stays inside the lane, and a self loop's legs are at least twice
 *   the head long (D659);
 * - each box's name and data lie inside the box;
 * - everything drawn lies inside `bounds`.
 */
import type { EventModel } from '../model.ts';
import { eventModelStructure } from '../structure.ts';
import { segmentEnters } from './detour.ts';
import { drawn } from './layout.ts';
import { EVENTMODELING_METRICS as M } from './metrics.ts';
import type { EventModelLayout, EventModelRelationLayout, Point, Rect } from './types.ts';
import {
  EPS,
  near,
  numbers,
  rectInside as inside,
  rectsOverlap as overlap,
  rectText as show,
  within,
} from '@mermaid-js/shared/testing/layout-invariants';

/** On the rectangle's outline (within the tolerance). */
function onEdge(p: Point, r: Rect): boolean {
  const inX = within(p.x, r.x, r.x + r.width);
  const inY = within(p.y, r.y, r.y + r.height);
  return (
    (inX && (near(p.y, r.y) || near(p.y, r.y + r.height))) ||
    (inY && (near(p.x, r.x) || near(p.x, r.x + r.width)))
  );
}

export function eventModelLayoutViolations(model: EventModel, layout: EventModelLayout): string[] {
  const out: string[] = [];
  const all: [string, number][] = [...numbers(layout, 'layout')];
  for (const [path, n] of all) if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  structureViolations(model, layout, out);
  placementViolations(layout, out);
  relationViolations(layout, out);
  const { lanes, boxes, relations } = layout;
  for (const r of drawn(lanes, boxes, relations))
    if (!inside(r, layout.bounds))
      out.push(`${show(r)} is outside the bounds ${show(layout.bounds)}`);
  return out;
}

/** The lanes, boxes and relations are the structure's, in its order. */
function structureViolations(model: EventModel, layout: EventModelLayout, out: string[]): void {
  const structure = eventModelStructure(model);
  const { lanes, boxes, relations } = layout;
  if (lanes.map((l) => l.index).join() !== structure.lanes.map((l) => l.index).join())
    out.push('the lanes differ from the structure');
  if (boxes.length !== model.frames.length)
    out.push(`${boxes.length} boxes for ${model.frames.length} frames`);
  for (const [k, box] of boxes.entries()) {
    if (box.frame !== k) out.push(`box ${k} is frame ${box.frame}`);
    if (box.lane !== structure.boxes[k]?.lane) out.push(`box ${k} is in the wrong lane`);
  }
  const key = (r: { source: number; target: number }): string => `${r.source}>${r.target}`;
  if (relations.map(key).join() !== structure.relations.map(key).join())
    out.push('the relations differ from the structure');
}

/** Lanes stacked in order; boxes in their lanes, in frame order, apart, holding their text. */
function placementViolations({ lanes, boxes }: EventModelLayout, out: string[]): void {
  for (let k = 1; k < lanes.length; k++) {
    const a = lanes[k - 1] as Rect;
    const b = lanes[k] as Rect;
    if (a.y + a.height > b.y + EPS)
      out.push(`lane ${k} ${show(b)} is not below lane ${k - 1} ${show(a)}`);
  }
  for (const [k, box] of boxes.entries()) {
    const lane = lanes[box.lane];
    if (!lane || !inside(box, lane)) out.push(`box ${k} ${show(box)} is outside its lane`);
    if (!inside(box.name, box))
      out.push(`box ${k}'s name ${show(box.name)} is outside ${show(box)}`);
    if (box.data && !inside(box.data, box))
      out.push(`box ${k}'s data ${show(box.data)} is outside ${show(box)}`);
    const next = boxes[k + 1];
    if (next && next.x <= box.x) out.push(`box ${k + 1} is not right of box ${k}`);
  }
  // Boxes in different lanes cannot meet when the lanes do not and each box is inside its own;
  // within a lane, each box is checked against the earlier ones that reach past its left edge.
  const open = new Map<number, Rect[]>();
  for (const [k, box] of boxes.entries()) {
    const active = (open.get(box.lane) ?? []).filter((b) => b.x + b.width > box.x + EPS);
    for (const before of active)
      if (overlap(before, box)) out.push(`box ${k} ${show(box)} overlaps ${show(before)}`);
    active.push(box);
    open.set(box.lane, active);
  }
}

/** The segment from `p` to `q` passes through the inside of `r`, past the tolerance. */
const enters = (p: Point, q: Point, r: Rect): boolean => segmentEnters(p, q, r, EPS, EPS);

type Segment = readonly [Point, Point];
const segments = (r: EventModelRelationLayout): Segment[] =>
  r.points.slice(1).map((q, k) => [r.points[k] as Point, q]);

/** Two segments on one line that overlap for more than a point. */
function shareRun([a, b]: Segment, [c, d]: Segment): boolean {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const length = Math.hypot(ux, uy);
  if (length <= EPS) return false;
  // Both of the other segment's ends on this one's line …
  const off = (p: Point): number => Math.abs(ux * (p.y - a.y) - uy * (p.x - a.x)) / length;
  if (off(c) > EPS || off(d) > EPS) return false;
  // … and their spans along it overlapping.
  const along = (p: Point): number => (ux * (p.x - a.x) + uy * (p.y - a.y)) / length;
  const lo = Math.max(0, Math.min(along(c), along(d)));
  const hi = Math.min(length, Math.max(along(c), along(d)));
  return hi - lo > EPS;
}

/** The segment's x extent. */
const xs = ([p, q]: Segment): [number, number] => [Math.min(p.x, q.x), Math.max(p.x, q.x)];

/** Each relation runs from its source's edge to its target's, its head at the end. */
function relationViolations(layout: EventModelLayout, out: string[]): void {
  const { boxes, relations } = layout;
  for (const r of relations) {
    const s = boxes[r.source];
    const t = boxes[r.target];
    const first = r.points[0];
    const end = r.points[r.points.length - 1];
    if (!s || !t || !first || !end || r.points.length < 2) {
      out.push(`relation ${r.id} has no line`);
      continue;
    }
    if (!onEdge(first, s)) out.push(`relation ${r.id} starts off its source's edge`);
    if (!onEdge(end, t)) out.push(`relation ${r.id} ends off its target's edge`);
    if (r.head[1].x !== end.x || r.head[1].y !== end.y)
      out.push(`relation ${r.id}'s head is not at its end`);
    if (s.lane === t.lane) laneViolations(r, layout.lanes[s.lane], out);
  }
  throughViolations(layout, out);
  sharedRunViolations(relations, out);
  loopEndViolations(relations, out);
}

/**
 * A self loop's ends meet no other relation's end on its box, so no two heads overlap there.
 * (Relations between lanes into one box share v12's anchor, as v12 drew them.)
 */
function loopEndViolations(relations: readonly EventModelRelationLayout[], out: string[]): void {
  const ends = (r: EventModelLayout['relations'][number]): Point[] => [
    r.points[0] as Point,
    r.points[r.points.length - 1] as Point,
  ];
  const same = (a: Point, b: Point): boolean => near(a.x, b.x) && near(a.y, b.y);
  for (const loop of relations) {
    if (loop.source !== loop.target) continue;
    for (const r of relations) {
      if (r === loop || (r.source !== loop.source && r.target !== loop.source)) continue;
      if (ends(loop).some((p) => ends(r).some((q) => same(p, q))))
        out.push(`relation ${loop.id} meets ${r.id} at an end`);
    }
  }
}

/** A relation within a lane stays in it, and a self loop's legs are twice its head (D659). */
function laneViolations(r: EventModelRelationLayout, lane: Rect | undefined, out: string[]): void {
  const dot = (p: Point): Rect => ({ ...p, width: 0, height: 0 });
  if (!lane || ![...r.points, ...r.head].every((p) => inside(dot(p), lane)))
    out.push(`relation ${r.id} leaves its lane`);
  if (r.source !== r.target) return;
  for (const [p, q] of [r.points.slice(0, 2), r.points.slice(-2)] as [Point, Point][])
    if (Math.hypot(q.x - p.x, q.y - p.y) < 2 * M.headLength - EPS)
      out.push(`relation ${r.id}'s loop has a leg shorter than twice its head`);
}

/**
 * No relation passes through a box other than its own two (D659 within a lane, D743 between
 * lanes): a box's name and data lie inside it, so none is struck out. A relation the layout
 * marks as having no detour that fits keeps v12's segment and is not checked. Boxes come in x order, so
 * each segment meets only the boxes from the first that may reach its left end to the last that
 * starts before its right end.
 */
function throughViolations({ boxes, relations }: EventModelLayout, out: string[]): void {
  let widest = 0;
  for (const b of boxes) widest = Math.max(widest, b.width);
  for (const r of relations) {
    if (r.noDetour) continue;
    for (const seg of segments(r))
      for (const k of crossed(seg, boxes, widest))
        if (k !== r.source && k !== r.target) out.push(`relation ${r.id} runs through box ${k}`);
  }
}

/** The boxes `seg` passes through the inside of; none is wider than `widest`. */
function crossed(seg: Segment, boxes: readonly Rect[], widest: number): number[] {
  const [lo, hi] = xs(seg);
  const out: number[] = [];
  for (let k = firstFrom(boxes, lo - widest); k < boxes.length; k++) {
    const b = boxes[k] as Rect;
    if (b.x >= hi) break;
    if (enters(seg[0], seg[1], b)) out.push(k);
  }
  return out;
}

/**
 * No two relations run along one line together (D659). Segments are swept left to right: only
 * those whose x extents meet can share a run.
 */
function sharedRunViolations(relations: readonly EventModelRelationLayout[], out: string[]): void {
  const id = (i: number): string => (relations[i] as EventModelRelationLayout).id;
  const all = relations.flatMap((r, i) => segments(r).map((seg) => ({ i, seg, x: xs(seg) })));
  all.sort((p, q) => p.x[0] - q.x[0]);
  const open: typeof all = [];
  for (const cur of all) {
    for (let k = open.length - 1; k >= 0; k--)
      if ((open[k] as (typeof all)[number]).x[1] < cur.x[0] - EPS) open.splice(k, 1);
    for (const other of open)
      if (other.i !== cur.i && shareRun(other.seg, cur.seg))
        out.push(`relations ${id(other.i)} and ${id(cur.i)} share a run`);
    open.push(cur);
  }
}

/** The first box whose x is at least `x` (boxes come in x order). */
function firstFrom(boxes: readonly Rect[], x: number): number {
  let lo = 0;
  let hi = boxes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((boxes[mid] as Rect).x < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
