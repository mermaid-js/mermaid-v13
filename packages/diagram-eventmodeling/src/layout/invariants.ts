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
 * - each box's name and data lie inside the box;
 * - everything drawn lies inside `bounds`.
 */
import type { EventModel } from '../model.ts';
import { eventModelStructure } from '../structure.ts';
import { drawn } from './layout.ts';
import type { EventModelLayout, Point, Rect } from './types.ts';

const EPS = 1e-6;

const show = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width} × ${r.height})`;

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.width <= outer.x + outer.width + EPS &&
    inner.y + inner.height <= outer.y + outer.height + EPS
  );
}

function overlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    b.x < a.x + a.width - EPS &&
    a.y < b.y + b.height - EPS &&
    b.y < a.y + a.height - EPS
  );
}

/** On the rectangle's outline (within the tolerance). */
function onEdge(p: Point, r: Rect): boolean {
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
  const inX = p.x >= r.x - EPS && p.x <= r.x + r.width + EPS;
  const inY = p.y >= r.y - EPS && p.y <= r.y + r.height + EPS;
  return (
    (inX && (near(p.y, r.y) || near(p.y, r.y + r.height))) ||
    (inY && (near(p.x, r.x) || near(p.x, r.x + r.width)))
  );
}

/** Every number in the layout, with a path to name it. */
function numbers(value: unknown, path: string, out: [string, number][]): void {
  if (typeof value === 'number') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => numbers(v, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) numbers(v, `${path}.${k}`, out);
}

export function eventModelLayoutViolations(model: EventModel, layout: EventModelLayout): string[] {
  const out: string[] = [];
  const all: [string, number][] = [];
  numbers(layout, 'layout', all);
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

/** Each relation runs from its source's edge to its target's, its head at the end. */
function relationViolations({ boxes, relations }: EventModelLayout, out: string[]): void {
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
  }
  // A self loop's ends meet no other relation's end on its box, so no two heads overlap there.
  // (Relations between lanes into one box share v12's anchor, as v12 drew them.)
  const ends = (r: EventModelLayout['relations'][number]): Point[] => [
    r.points[0] as Point,
    r.points[r.points.length - 1] as Point,
  ];
  const same = (a: Point, b: Point): boolean =>
    Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
  for (const loop of relations) {
    if (loop.source !== loop.target) continue;
    for (const r of relations) {
      if (r === loop || (r.source !== loop.source && r.target !== loop.source)) continue;
      if (ends(loop).some((p) => ends(r).some((q) => same(p, q))))
        out.push(`relation ${loop.id} meets ${r.id} at an end`);
    }
  }
}
