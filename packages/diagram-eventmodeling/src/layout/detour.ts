/**
 * Relations between lanes that would meet a box other than their two (D743, amends D521). v12
 * drew one segment from ⅔ of the source's width to ⅓ of the target's, through whatever lay
 * between; a segment that enters another box, or comes within `relationGap` of it, is redrawn
 * here, after the lanes are stacked, from vertical and horizontal pieces:
 *
 * - it goes up or down at an x that is `detourClearance` clear of every box (and lane label) of
 *   the lanes between its two, and at most `detourReach` outside its two boxes: the column;
 * - where the column meets the source's or the target's edge, at least `detourClearance` in from
 *   its corners, the relation leaves or enters there; else it leaves (or enters) that edge as
 *   near the column as it can, and runs across the gap between that box's lane and the next;
 * - so a detour is one vertical segment, or one with a jog at one end, or at both; fewer jogs
 *   first, then the shortest run across;
 * - runs that would share a line of a gap take its middle, then `detourStep` away from the
 *   target, then toward it; columns keep `detourStep` apart, and a moved end keeps `detourStep`
 *   from the other ends on its side of the box.
 *
 * Relations that clear every box keep their segment, and so does one no detour fits. Every
 * lookup reads only the boxes, columns and runs near the relation, so the layout stays linear.
 */
import { EVENTMODELING_METRICS as M } from './metrics.ts';
import type {
  EventModelBoxLayout,
  EventModelLaneLayout,
  EventModelRoute,
  Point,
  Rect,
} from './types.ts';

/** A relation as first routed: its boxes, how it runs, and its line. */
export interface FirstRoute {
  readonly source: number;
  readonly target: number;
  readonly route: EventModelRoute;
  readonly points: readonly Point[];
}

type Span = readonly [number, number];

/**
 * The segment from `p` to `q` passes through the inside of `r` shrunk by `inset` on each side
 * (Liang–Barsky clipping; a negative `inset` grows it) for more than `min` of its length.
 */
export function segmentEnters(p: Point, q: Point, r: Rect, inset: number, min = 0): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const sides: [number, number][] = [
    [-dx, p.x - (r.x + inset)],
    [dx, r.x + r.width - inset - p.x],
    [-dy, p.y - (r.y + inset)],
    [dy, r.y + r.height - inset - p.y],
  ];
  for (const [d, room] of sides) {
    if (d === 0) {
      if (room < 0) return false;
    } else if (d < 0) t0 = Math.max(t0, room / d);
    else t1 = Math.min(t1, room / d);
  }
  return t1 - t0 > min;
}

/** A run across the gap below lane `gap`, `level` steps off the gap's middle. */
interface Run {
  readonly gap: number;
  readonly level: number;
  readonly span: Span;
}

/** A vertical segment of a detour: its x and the y it spans. */
interface Column {
  readonly x: number;
  readonly span: Span;
}

/** What the detours take as they are placed, so later ones keep apart from them. */
interface Taken {
  /** By gap and level, the runs there, in x order (they never overlap). */
  readonly runs: Map<string, Run[]>;
  /** By cell (`boxMinWidth` wide), the columns whose x lies in it. */
  readonly columns: Map<number, Column[]>;
  /** By box and side (`2 × box`, plus 1 for the bottom), the x of every relation end there. */
  readonly ends: Map<number, number[]>;
}

interface Scene {
  readonly boxes: readonly EventModelBoxLayout[];
  readonly lanes: readonly EventModelLaneLayout[];
  /** By lane, its boxes' indices, in x order. */
  readonly rows: readonly (readonly number[])[];
  /** By lane, the y from its boxes' top to the lowest box bottom. */
  readonly bands: readonly Span[];
  readonly taken: Taken;
}

/** Each relation's line: its first route's, or a detour where that meets another box. */
export function detourRoutes(
  routes: readonly FirstRoute[],
  boxes: readonly EventModelBoxLayout[],
  lanes: readonly EventModelLaneLayout[]
): Point[][] {
  const rows: number[][] = lanes.map(() => []);
  const bands: [number, number][] = lanes.map(() => [Infinity, -Infinity]);
  for (const [k, b] of boxes.entries()) {
    rows[b.lane]?.push(k);
    const band = bands[b.lane] as [number, number];
    band[0] = Math.min(band[0], b.y);
    band[1] = Math.max(band[1], b.y + b.height);
  }
  const taken: Taken = { runs: new Map(), columns: new Map(), ends: new Map() };
  const scene: Scene = { boxes, lanes, rows, bands, taken };
  for (const r of routes) {
    addEnd(scene, r.source, r.points[0]);
    addEnd(scene, r.target, r.points[r.points.length - 1]);
  }
  return routes.map((r) => {
    if ((r.route !== 'up' && r.route !== 'down') || !meetsAnother(scene, r)) return [...r.points];
    return detour(scene, r) ?? [...r.points];
  });
}

/** 0 for an end on a box's top edge, 1 on its bottom; `undefined` for any other. */
function sideOf(box: Rect, y: number): number | undefined {
  if (y === box.y) return 0;
  return y === box.y + box.height ? 1 : undefined;
}

function endsAt(scene: Scene, k: number, y: number): number[] | undefined {
  const box = scene.boxes[k];
  const side = box && sideOf(box, y);
  if (side === undefined) return undefined;
  const key = 2 * k + side;
  let list = scene.taken.ends.get(key);
  if (!list) {
    list = [];
    scene.taken.ends.set(key, list);
  }
  return list;
}

function addEnd(scene: Scene, k: number, p: Point | undefined): void {
  if (p) endsAt(scene, k, p.y)?.push(p.x);
}

/**
 * Whether `test` holds for a box of lane `lane` that reaches into `lo` to `hi` widened by `pad`
 * on each side; boxes are tried in x order and the first that passes stops the search. A lane's
 * boxes do not overlap, so their right edges are in x order too.
 */
function someInRow(
  scene: Scene,
  lane: number,
  [lo, hi]: Span,
  pad: number,
  test: (k: number) => boolean
): boolean {
  const row = scene.rows[lane] ?? [];
  const right = (k: number): number => {
    const b = scene.boxes[k] as Rect;
    return b.x + b.width + pad;
  };
  let a = 0;
  let b = row.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (right(row[mid] as number) < lo) a = mid + 1;
    else b = mid;
  }
  for (let i = a; i < row.length; i++) {
    const k = row[i] as number;
    if ((scene.boxes[k] as Rect).x - pad > hi) return false;
    if (test(k)) return true;
  }
  return false;
}

/**
 * The segment comes within `relationGap` of a box other than its two. In each lane from the
 * source's to the target's, only the boxes under the part of the segment at their height are read.
 */
function meetsAnother(scene: Scene, { source, target, points }: FirstRoute): boolean {
  const [p, q] = points as [Point, Point];
  const s = scene.boxes[source] as EventModelBoxLayout;
  const t = scene.boxes[target] as EventModelBoxLayout;
  const gap = M.relationGap;
  for (let lane = Math.min(s.lane, t.lane); lane <= Math.max(s.lane, t.lane); lane++) {
    const [top, bottom] = scene.bands[lane] as Span;
    const xs = xsWithin(p, q, [top - gap, bottom + gap]);
    const meets = (k: number): boolean =>
      k !== source && k !== target && segmentEnters(p, q, scene.boxes[k] as Rect, -gap);
    if (xs && someInRow(scene, lane, xs, gap, meets)) return true;
  }
  return false;
}

/** The x the segment from `p` to `q` takes while its y is within `ys`; none if it never is. */
function xsWithin(p: Point, q: Point, [lo, hi]: Span): Span | undefined {
  const dy = q.y - p.y;
  if (dy === 0) return p.y < lo || p.y > hi ? undefined : [Math.min(p.x, q.x), Math.max(p.x, q.x)];
  const ta = Math.max(0, Math.min((lo - p.y) / dy, (hi - p.y) / dy));
  const tb = Math.min(1, Math.max((lo - p.y) / dy, (hi - p.y) / dy));
  if (ta > tb) return undefined;
  const xa = p.x + (q.x - p.x) * ta;
  const xb = p.x + (q.x - p.x) * tb;
  return [Math.min(xa, xb), Math.max(xa, xb)];
}

/** How a detour reaches its column: the column at both ends, a jog at one end, or at both. */
type Shape = 'column' | 'jogAtTarget' | 'jogAtSource' | 'jogs';
const SHAPES: readonly Shape[] = ['column', 'jogAtTarget', 'jogAtSource', 'jogs'];

interface Candidate {
  readonly shape: Shape;
  readonly x: number;
  readonly cost: number;
}

/** The detour with the fewest jogs and the shortest run across that fits; none if none does. */
function detour(scene: Scene, r: FirstRoute): Point[] | undefined {
  const s = scene.boxes[r.source] as EventModelBoxLayout;
  const t = scene.boxes[r.target] as EventModelBoxLayout;
  const [from, to] = r.points as [Point, Point];
  const ys: Span = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
  const free = reachOf(s, t).flatMap((reach) => freeSpans(scene, s, t, reach, ys));
  for (const c of candidates(free, inner(s), inner(t), from.x, to.x)) {
    const placed = place(scene, r, c);
    if (placed) return placed;
  }
  return undefined;
}

/**
 * Where a column may run: within `detourReach` of the source or of the target, one span when
 * the two meet.
 */
function reachOf(s: Rect, t: Rect): Span[] {
  const around = (b: Rect): Span => [b.x - M.detourReach, b.x + b.width + M.detourReach];
  const [a, b] = [around(s), around(t)].sort((u, v) => u[0] - v[0]) as [Span, Span];
  return a[1] >= b[0] ? [[a[0], Math.max(a[1], b[1])]] : [a, b];
}

/** Where a column may meet a box's edge: `detourClearance` in from its corners. */
const inner = (b: Rect): Span => [b.x + M.detourClearance, b.x + b.width - M.detourClearance];

const meet = (a: Span | undefined, b: Span): Span | undefined => {
  if (!a) return undefined;
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : undefined;
};

const clampTo = (v: number, [lo, hi]: Span): number => Math.max(lo, Math.min(hi, v));

/** For each free span, the best x of each shape there, ordered by jogs, then length across. */
function candidates(
  free: readonly Span[],
  source: Span,
  target: Span,
  fromX: number,
  toX: number
): Candidate[] {
  const mid = (fromX + toX) / 2;
  const out: Candidate[] = [];
  for (const span of free) {
    const room: Record<Shape, [Span | undefined, number]> = {
      column: [meet(meet(span, source), target), mid],
      jogAtTarget: [meet(span, source), toX],
      jogAtSource: [meet(span, target), fromX],
      jogs: [span, mid],
    };
    for (const shape of SHAPES) {
      const [within, aim] = room[shape];
      if (!within) continue;
      const x = clampTo(aim, within);
      out.push({ shape, x, cost: Math.abs(x - fromX) + Math.abs(x - toX) });
    }
  }
  const rank = (c: Candidate): number => SHAPES.indexOf(c.shape);
  return out.sort((a, b) => rank(a) - rank(b) || a.cost - b.cost);
}

/**
 * The x of `reach` where a column may run between the two boxes' lanes: clear of every box and
 * lane label of the lanes between, and of the columns already taken over `ys`.
 */
function freeSpans(
  scene: Scene,
  s: EventModelBoxLayout,
  t: EventModelBoxLayout,
  reach: Span,
  ys: Span
): Span[] {
  const blocked: Span[] = [];
  const c = M.detourClearance;
  const block = (r: Rect): number => blocked.push([r.x - c, r.x + r.width + c]);
  for (let lane = Math.min(s.lane, t.lane) + 1; lane < Math.max(s.lane, t.lane); lane++) {
    someInRow(scene, lane, reach, c, (k) => {
      block(scene.boxes[k] as Rect);
      return false;
    });
    block((scene.lanes[lane] as EventModelLaneLayout).label);
  }
  const step = M.detourStep;
  for (const col of columnsNear(scene, [reach[0] - step, reach[1] + step]))
    if (col.span[0] < ys[1] && ys[0] < col.span[1]) blocked.push([col.x - step, col.x + step]);
  return complement(blocked, reach);
}

/** The x of `within` outside every span of `blocked` (their insides), as closed spans. */
function complement(blocked: Span[], [from, to]: Span): Span[] {
  blocked.sort((a, b) => a[0] - b[0]);
  const out: Span[] = [];
  let x = from;
  for (const [a, b] of blocked) {
    if (a > x) out.push([x, Math.min(a, to)]);
    x = Math.max(x, b);
    if (x > to) return out;
  }
  out.push([x, to]);
  return out;
}

const cellOf = (x: number): number => Math.floor(x / M.boxMinWidth);

/** The columns taken whose x lies within `lo` to `hi`, or in the cells it meets. */
function columnsNear(scene: Scene, [lo, hi]: Span): Column[] {
  const out: Column[] = [];
  for (let c = cellOf(lo); c <= cellOf(hi); c++) out.push(...(scene.taken.columns.get(c) ?? []));
  return out;
}

/** The gaps a relation's runs may use, next to the source's lane and the target's. */
function gapsOf(scene: Scene, s: EventModelBoxLayout, t: EventModelBoxLayout) {
  const up = s.lane > t.lane;
  // The gap below lane `k` is `k`; its middle is `laneGap / 2` below the lane.
  const middle = (k: number): number => {
    const lane = scene.lanes[k] as Rect;
    return lane.y + lane.height + M.laneGap / 2;
  };
  // Away from the target: a run steps first that way, so the last leg stays long.
  return {
    source: up ? s.lane - 1 : s.lane,
    target: up ? t.lane : t.lane - 1,
    middle,
    away: up ? 1 : -1,
  };
}

/** The candidate's line, with its runs placed and taken, or none if a run or an end does not fit. */
function place(scene: Scene, r: FirstRoute, c: Candidate): Point[] | undefined {
  const s = scene.boxes[r.source] as EventModelBoxLayout;
  const t = scene.boxes[r.target] as EventModelBoxLayout;
  const [from, to] = r.points as [Point, Point];
  const start =
    c.shape === 'column' || c.shape === 'jogAtTarget' ? c.x : toward(scene, r.source, from, c.x);
  const end =
    c.shape === 'column' || c.shape === 'jogAtSource' ? c.x : toward(scene, r.target, to, c.x);
  if (!endFits(scene, r.source, from, start) || !endFits(scene, r.target, to, end))
    return undefined;
  const gaps = gapsOf(scene, s, t);
  const runs: Run[] = [];
  const points: Point[] = [{ x: start, y: from.y }];
  for (const [gap, a, b] of [
    [gaps.source, start, c.x],
    [gaps.target, c.x, end],
  ] as const) {
    if (a === b) continue;
    const run = freeRun(scene, gap, [Math.min(a, b), Math.max(a, b)], runs);
    if (!run) return undefined;
    runs.push(run);
    const y = gaps.middle(gap) + gaps.away * run.level * M.detourStep;
    points.push({ x: a, y }, { x: b, y });
  }
  points.push({ x: end, y: to.y });
  if (!verticalsFree(scene, points, [from.x, to.x])) return undefined;
  take(scene, r, runs, points);
  return points;
}

/** The line's vertical segments. */
function verticals(points: readonly Point[]): Column[] {
  const out: Column[] = [];
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1] as Point;
    const q = points[k] as Point;
    if (p.x === q.x && p.y !== q.y)
      out.push({ x: p.x, span: [Math.min(p.y, q.y), Math.max(p.y, q.y)] });
  }
  return out;
}

/**
 * No vertical segment of the line comes within a step of a column already taken beside it; a leg
 * at an anchor the relation kept (spread a little less apart, D743) only may not lie on one.
 */
function verticalsFree(scene: Scene, points: readonly Point[], kept: readonly number[]): boolean {
  return verticals(points).every(({ x, span }) => {
    const beside = (c: Column): boolean =>
      kept.includes(x) ? c.x !== x : Math.abs(c.x - x) >= M.detourStep;
    return columnsNear(scene, [x - M.detourStep, x + M.detourStep]).every(
      (c) => beside(c) || c.span[1] <= span[0] || span[1] <= c.span[0]
    );
  });
}

/** Off the middle of a gap, in steps: the middle, one away from the target, one toward it. */
const LEVELS: readonly number[] = [0, 1, -1];

const runKey = (gap: number, level: number): string => `${gap}|${level}`;

/** The first level of the gap where the span keeps a step from every run there, and from `own`. */
function freeRun(scene: Scene, gap: number, span: Span, own: readonly Run[]): Run | undefined {
  const apart = (o: Run): boolean =>
    o.span[1] + M.detourStep <= span[0] || span[1] + M.detourStep <= o.span[0];
  for (const level of LEVELS) {
    if (own.some((o) => o.gap === gap && o.level === level && !apart(o))) continue;
    const list = scene.taken.runs.get(runKey(gap, level)) ?? [];
    const i = firstRunAfter(list, span[0]);
    const before = list[i - 1];
    const after = list[i];
    if ((!before || apart(before)) && (!after || apart(after))) return { gap, level, span };
  }
  return undefined;
}

/** The first run of `list` (in x order) that starts at `x` or later. */
function firstRunAfter(list: readonly Run[], x: number): number {
  let a = 0;
  let b = list.length;
  while (a < b) {
    const mid = (a + b) >> 1;
    if ((list[mid] as Run).span[0] < x) a = mid + 1;
    else b = mid;
  }
  return a;
}

/**
 * Where a relation that jogs leaves (or enters) its box: as near the column as the box's edge
 * allows, so the run across stays short and passes no other end of the box; at its anchor when
 * that place is too near another end.
 */
function toward(scene: Scene, k: number, at: Point, x: number): number {
  const near = clampTo(x, inner(scene.boxes[k] as Rect));
  return endFits(scene, k, at, near) ? near : at.x;
}

/** A moved end keeps `detourStep` from the other ends on its side of the box. */
function endFits(scene: Scene, k: number, was: Point, x: number): boolean {
  if (x === was.x) return true;
  const others = endsAt(scene, k, was.y) ?? [];
  let own = false;
  for (const o of others) {
    if (!own && o === was.x) {
      own = true;
      continue;
    }
    if (Math.abs(o - x) < M.detourStep) return false;
  }
  return true;
}

/** Records the detour's runs, its vertical segments, and its moved ends. */
function take(scene: Scene, r: FirstRoute, runs: readonly Run[], points: Point[]): void {
  for (const run of runs) {
    const key = runKey(run.gap, run.level);
    const list = scene.taken.runs.get(key) ?? [];
    list.splice(firstRunAfter(list, run.span[0]), 0, run);
    scene.taken.runs.set(key, list);
  }
  for (const col of verticals(points)) {
    const cell = cellOf(col.x);
    const list = scene.taken.columns.get(cell) ?? [];
    list.push(col);
    scene.taken.columns.set(cell, list);
  }
  moveEnd(scene, r.source, r.points[0] as Point, points[0] as Point);
  moveEnd(scene, r.target, r.points[1] as Point, points[points.length - 1] as Point);
}

function moveEnd(scene: Scene, k: number, was: Point, now: Point): void {
  const list = endsAt(scene, k, was.y);
  const i = list ? list.indexOf(was.x) : -1;
  if (list && i >= 0) list.splice(i, 1, now.x);
}
