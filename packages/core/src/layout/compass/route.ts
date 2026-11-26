// `compass`'s orthogonal router, ported from Pele (https://github.com/obsidianmd/pele,
// src/diagrams/architecture/render.ts:106-170, `route` and `simplify`, MIT, (c) 2026 kepano; see
// THIRD_PARTY_NOTICES). Each end leaves along its side's normal: straight when the ends face and
// are in line, one bend when the sides are perpendicular and the corner is ahead of both, a turn
// midway when they face but are offset, and otherwise a detour between or around the two boxes.
//
// Changed from Pele: `route` split into one function per case, with the same cases in the same
// order; route points with an axis; `clearSpot`, which moves an edge label off any node; and
// `detour`, which slides a run of a route with two or more bends off a node it would cross (#767,
// D507, D720), end runs included. Pele's router sees only the two end boxes.
import type { Point, RoutePoint } from '../types.ts';
import type { Rect } from '../layered/end-markers.ts';
import { METRICS } from './metrics.ts';

export type { Rect };

export interface Port extends Rect {
  // Where the end is, and its side's outward normal. The rect is the box the route has to stay
  // out of when it cannot leave straight.
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export const hits = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Bucket keys pack a cell's column and row into one number, as `grid.ts`'s cell map does.
const OFFSET = 2 ** 25;
const SPAN = 2 ** 26;

/**
 * Rects bucketed by a uniform grid of `cell`-sized squares, so asking what a small rect hits
 * looks at the few rects near it rather than at all of them. Each rect has an owner (an edge
 * index, or -1) that a query may skip.
 */
export class Space {
  readonly cell: number;
  readonly rects: Rect[] = [];
  readonly owners: number[] = [];
  readonly buckets = new Map<number, number[]>();

  constructor(cell: number) {
    this.cell = cell > 0 && Number.isFinite(cell) ? cell : 1;
  }

  private span(r: Rect): [number, number, number, number] {
    const c = this.cell;
    return [Math.floor(r.x0 / c), Math.floor(r.y0 / c), Math.floor(r.x1 / c), Math.floor(r.y1 / c)];
  }

  add(r: Rect, owner = -1): void {
    const k = this.rects.length;
    this.rects.push(r);
    this.owners.push(owner);
    const [cx0, cy0, cx1, cy1] = this.span(r);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const key = (cx + OFFSET) * SPAN + cy + OFFSET;
        const list = this.buckets.get(key);
        if (list) list.push(k);
        else this.buckets.set(key, [k]);
      }
    }
  }

  /** The first-added rect `r` overlaps, other than those owned by `skip` (or it says to skip). */
  hit(r: Rect, skip: number | ((owner: number) => boolean) = -2): Rect | undefined {
    const skips = typeof skip === 'number' ? (o: number) => o === skip : skip;
    let best = -1;
    const [cx0, cy0, cx1, cy1] = this.span(r);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        for (const k of this.buckets.get((cx + OFFSET) * SPAN + cy + OFFSET) ?? []) {
          if ((best < 0 || k < best) && !skips(this.owners[k]!) && hits(this.rects[k]!, r))
            best = k;
        }
      }
    }
    return best < 0 ? undefined : this.rects[best];
  }
}

/** Perpendicular sides: one bend when the corner is ahead of both ends, else out and back. */
function turn(s: Port, e: Port): number[] {
  const STUB = METRICS.stub;
  const cx = s.dx !== 0 ? e.x : s.x;
  const cy = s.dx !== 0 ? s.y : e.y;
  if ((cx - s.x) * s.dx + (cy - s.y) * s.dy > 0 && (cx - e.x) * e.dx + (cy - e.y) * e.dy > 0)
    return [s.x, s.y, cx, cy, e.x, e.y];
  const s1x = s.x + s.dx * STUB;
  const s1y = s.y + s.dy * STUB;
  const e1x = e.x + e.dx * STUB;
  const e1y = e.y + e.dy * STUB;
  return s.dx !== 0
    ? [s.x, s.y, s1x, s1y, s1x, e1y, e1x, e1y, e.x, e.y]
    : [s.x, s.y, s1x, s1y, e1x, s1y, e1x, e1y, e.x, e.y];
}

/** Facing sides with the target ahead: straight, or a turn midway between the two boxes. */
function facing(s: Port, e: Port, offset: number): number[] {
  if (Math.abs(offset) < 0.5) return [s.x, s.y, e.x, e.y];
  // Turn midway between the two boxes, which is clear of both titles, when there is such a place.
  if (s.dx !== 0) {
    const lo = s.dx > 0 ? s.x1 : e.x1;
    const hi = s.dx > 0 ? e.x0 : s.x0;
    const mx = lo < hi ? (lo + hi) / 2 : (s.x + e.x) / 2;
    return [s.x, s.y, mx, s.y, mx, e.y, e.x, e.y];
  }
  const lo = s.dy > 0 ? s.y1 : e.y1;
  const hi = s.dy > 0 ? e.y0 : s.y0;
  const my = lo < hi ? (lo + hi) / 2 : (s.y + e.y) / 2;
  return [s.x, s.y, s.x, my, e.x, my, e.x, e.y];
}

/** Like sides, offset: out past the further end and back. */
function alike(s: Port, e: Port): number[] {
  const STUB = METRICS.stub;
  if (s.dx !== 0) {
    const x = s.dx > 0 ? Math.max(s.x, e.x) + STUB : Math.min(s.x, e.x) - STUB;
    return [s.x, s.y, x, s.y, x, e.y, e.x, e.y];
  }
  const y = s.dy > 0 ? Math.max(s.y, e.y) + STUB : Math.min(s.y, e.y) - STUB;
  return [s.x, s.y, s.x, y, e.x, y, e.x, e.y];
}

/** A lane between two boxes along one axis, or past both when they overlap on it. */
function lane(a0: number, a1: number, b0: number, b1: number): number {
  const STUB = METRICS.stub;
  if (a1 + STUB <= b0) return (a1 + b0) / 2;
  if (b1 + STUB <= a0) return (b1 + a0) / 2;
  return Math.max(a1, b1) + STUB;
}

// The straight way is blocked by one of the two nodes: go between them, or around both.
function around(s: Port, e: Port): number[] {
  const STUB = METRICS.stub;
  const s1x = s.x + s.dx * STUB;
  const s1y = s.y + s.dy * STUB;
  const e1x = e.x + e.dx * STUB;
  const e1y = e.y + e.dy * STUB;
  if (s.dx !== 0) {
    const y = lane(s.y0, s.y1, e.y0, e.y1);
    return [s.x, s.y, s1x, s.y, s1x, y, e1x, y, e1x, e.y, e.x, e.y];
  }
  const x = lane(s.x0, s.x1, e.x0, e.x1);
  return [s.x, s.y, s.x, s1y, x, s1y, x, e1y, e.x, e1y, e.x, e.y];
}

/** An orthogonal route from one port to another, each left along its side's normal. */
export function route(s: Port, e: Port): number[] {
  if (s.dx * e.dx + s.dy * e.dy === 0) return turn(s, e);
  const offset = s.dx !== 0 ? e.y - s.y : e.x - s.x;
  if (s.dx === -e.dx && s.dy === -e.dy) {
    if ((e.x - s.x) * s.dx + (e.y - s.y) * s.dy > 0) return facing(s, e, offset);
  } else if (Math.abs(offset) >= 1) {
    return alike(s, e);
  }
  return around(s, e);
}

// Drops repeated points and joins runs that continue in a straight line.
export function simplify(p: number[]): number[] {
  const out = [p[0]!, p[1]!];
  for (let i = 2; i < p.length; i += 2) {
    const x = p[i]!;
    const y = p[i + 1]!;
    const n = out.length;
    const sameX = Math.abs(x - out[n - 2]!) < 0.01;
    const sameY = Math.abs(y - out[n - 1]!) < 0.01;
    if (sameX && sameY) continue;
    if (
      n >= 4 &&
      ((sameX && Math.abs(out[n - 4]! - out[n - 2]!) < 0.01) ||
        (sameY && Math.abs(out[n - 3]! - out[n - 1]!) < 0.01))
    ) {
      out[n - 2] = x;
      out[n - 1] = y;
    } else {
      out.push(x, y);
    }
  }
  return out;
}

/** Flat `[x, y, …]` to route points, each with the axis the route runs into it along. */
export function toRoute(p: number[]): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (let i = 0; i < p.length; i += 2) {
    const j = i === 0 ? 2 : i;
    const flat = Math.abs(p[j - 1]! - p[j + 1]!) < 0.01 && Math.abs(p[j - 2]! - p[j]!) >= 0.01;
    out.push({ x: p[i]!, y: p[i + 1]!, axis: flat ? 'h' : 'v' });
  }
  return out;
}

/** Which way, -1 or 1, `v` lies from the middle of `lo`..`hi`. */
const away = (v: number, lo: number, hi: number): number => (v >= (lo + hi) / 2 ? 1 : -1);

/**
 * Where a `w` × `h` label centred at `at` sits clear of every node: `at` itself when it is clear,
 * else the first clear spot at the middle, quarters or eighths of a run (longest run first), on
 * the line or beside it, else `at` pushed across its run past each node it lands on.
 */
export function clearSpot(
  points: number[],
  at: Point,
  size: { w: number; h: number },
  upright: boolean,
  nodes: Space
): Point {
  const { w, h } = size;
  const box = (p: Point): Rect => ({
    x0: p.x - w / 2,
    y0: p.y - h / 2,
    x1: p.x + w / 2,
    y1: p.y + h / 2,
  });
  const hit = (p: Point): Rect | undefined => nodes.hit(box(p));
  if (!hit(at)) return at;
  const runs: number[] = [];
  for (let i = 0; i + 3 < points.length; i += 2) runs.push(i);
  const length = (i: number): number =>
    Math.abs(points[i]! - points[i + 2]!) + Math.abs(points[i + 1]! - points[i + 3]!);
  runs.sort((a, b) => length(b) - length(a) || a - b);
  for (const i of runs) {
    const spot = runSpot(points, i, size, hit);
    if (spot) return spot;
  }
  // Past every node in the way, across the run, in one direction so it ends.
  const p = { ...at };
  const first = hit(p)!;
  const dir = upright ? away(p.x, first.x0, first.x1) : away(p.y, first.y0, first.y1);
  const clear = METRICS.labelClear;
  for (let n = hit(p); n; n = hit(p)) {
    if (upright) p.x = dir > 0 ? n.x1 + w / 2 + clear : n.x0 - w / 2 - clear;
    else p.y = dir > 0 ? n.y1 + h / 2 + clear : n.y0 - h / 2 - clear;
  }
  return p;
}

/** The first clear spot on run `i` or beside it, at its middle, quarters or eighths. */
function runSpot(
  points: number[],
  i: number,
  size: { w: number; h: number },
  hit: (p: Point) => Rect | undefined
): Point | undefined {
  const vertical = Math.abs(points[i]! - points[i + 2]!) < 0.01;
  const off = (vertical ? size.w : size.h) / 2 + METRICS.labelClear;
  for (const t of [1 / 2, 1 / 4, 3 / 4, 1 / 8, 7 / 8]) {
    const px = points[i]! + (points[i + 2]! - points[i]!) * t;
    const py = points[i + 1]! + (points[i + 3]! - points[i + 1]!) * t;
    for (const side of [0, 1, -1]) {
      const p = vertical ? { x: px + side * off, y: py } : { x: px, y: py + side * off };
      if (!hit(p)) return p;
    }
  }
  return undefined;
}

/** The box a run from point `k` to point `k + 1` of `p` covers (flat: no height or no width). */
function runBox(p: readonly number[], k: number): Rect {
  const [x0, x1] =
    p[2 * k]! < p[2 * k + 2]! ? [p[2 * k]!, p[2 * k + 2]!] : [p[2 * k + 2]!, p[2 * k]!];
  const [y0, y1] =
    p[2 * k + 1]! < p[2 * k + 3]! ? [p[2 * k + 1]!, p[2 * k + 3]!] : [p[2 * k + 3]!, p[2 * k + 1]!];
  return { x0, y0, x1, y1 };
}

/** Which way run `k` of `p` goes along its axis: 1, -1, or 0 when it has no length. */
const runWay = (p: readonly number[], k: number): number =>
  Math.sign(p[2 * k + 2]! - p[2 * k]! + p[2 * k + 3]! - p[2 * k + 1]!);

/** Whether run `j` of `q` still goes the way it went in `p`; a run of no length may go any way. */
const kept = (p: readonly number[], q: readonly number[], j: number): boolean =>
  runWay(p, j) === 0 || runWay(q, j) === runWay(p, j);

/**
 * `p` with an elbow a stub out of each port whose run is longer than that: the point twice, so the
 * rest of an end run can slide like an inner run while the stub stays on the port.
 */
function elbows(p: readonly number[]): number[] {
  const { stub } = METRICS;
  const q = [...p];
  for (const [i, j] of [
    [q.length - 2, q.length - 4],
    [0, 2],
  ] as const) {
    const ux = Math.sign(q[j]! - q[i]!);
    const uy = Math.sign(q[j + 1]! - q[i + 1]!);
    if (Math.abs(q[j]! - q[i]!) + Math.abs(q[j + 1]! - q[i + 1]!) <= stub) continue;
    const x = q[i]! + ux * stub;
    const y = q[i + 1]! + uy * stub;
    q.splice(Math.max(i, j), 0, x, y, x, y);
  }
  return q;
}

/**
 * `p` (simplified route points) with each run that `blocked` says crosses a node slid across its
 * direction until it is clear: half a cell gap past the node, or a stub past it, on the nearer
 * side first. An end run slides from a stub out of its port, where the route gains an elbow. The
 * runs on either side stretch with it and keep their direction; one that the slide puts on a
 * node slides too (D720), and the slide is kept only when all three are clear. A route with fewer
 * than two bends is returned as it is (D507 keeps v12's look for those), and so is a route no
 * slide clears.
 */
export function detour(p: number[], blocked: (r: Rect) => Rect | undefined): number[] {
  const n = p.length / 2;
  if (n < 4) return p;
  let k = 0;
  while (k < n - 1 && !blocked(runBox(p, k))) k++;
  if (k === n - 1) return p;
  let out = elbows(p);
  let moved = false;
  for (k = 1; k <= out.length / 2 - 3; k++) {
    const b = blocked(runBox(out, k));
    const q = b && slid(out, k, b, blocked, true);
    if (q) [out, moved] = [q, true];
  }
  return moved ? out : p;
}

/**
 * `p` with run `k` slid off the node box `b`, or undefined when no slide keeps it clear. When
 * `deep`, a neighbouring inner run that the slide puts on a node is slid off it in turn.
 */
function slid(
  p: readonly number[],
  k: number,
  b: Rect,
  blocked: (r: Rect) => Rect | undefined,
  deep: boolean
): number[] | undefined {
  const flat = Math.abs(p[2 * k + 1]! - p[2 * k + 3]!) < 0.01;
  // The coordinate that slides: y for a flat run, x for an upright one.
  const c = flat ? 1 : 0;
  const at = p[2 * k + c]!;
  const [lo, hi] = flat ? (['y0', 'y1'] as const) : (['x0', 'x1'] as const);
  const past = (r: Rect, dir: number, room: number): number =>
    dir > 0 ? r[hi] + room : r[lo] - room;
  const { gap, stub } = METRICS;
  // Past the node's far or near side, by half a gap or by a stub: the nearest first.
  const tries: [number, number][] = [
    [1, gap / 2],
    [-1, gap / 2],
    [1, stub],
    [-1, stub],
  ];
  tries.sort((u, v) => Math.abs(past(b, ...u) - at) - Math.abs(past(b, ...v) - at));
  for (const [dir, room] of tries) {
    // On past each node the run lands on, the same way, until it lands on none.
    let q = [...p];
    for (let hit: Rect | undefined = b; hit; hit = blocked(runBox(q, k))) {
      q[2 * k + c] = q[2 * k + 2 + c] = past(hit, dir, room);
    }
    if (!kept(p, q, k - 1) || !kept(p, q, k + 1)) continue;
    if (deep) q = slidNeighbours(q, k, blocked);
    if ([k - 1, k, k + 1].every((j) => !blocked(runBox(q, j)))) return q;
  }
  return undefined;
}

/** `p` with each inner run beside run `k` that lies on a node slid off it, where one slide can. */
function slidNeighbours(p: number[], k: number, blocked: (r: Rect) => Rect | undefined): number[] {
  const last = p.length / 2 - 2;
  let q = p;
  for (const j of [k - 1, k + 1]) {
    const on = j > 0 && j < last ? blocked(runBox(q, j)) : undefined;
    if (on) q = slid(q, j, on, blocked, false) ?? q;
  }
  return q;
}
