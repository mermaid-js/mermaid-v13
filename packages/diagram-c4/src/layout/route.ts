/**
 * The C4 relation router (D455), ported from Pele's `src/diagrams/c4/route.ts`
 * (https://github.com/obsidianmd/pele at commit 3a2f075, MIT, (c) 2026 kepano): a straight line where it
 * crosses no other shape; past a shape, an orthogonal elbow through a free lane in the gap
 * between columns or rows, or a detour lane round the shapes in the way; ports spread along a
 * side, reverse pairs shifted apart, self-loops on the right side.
 *
 * Added in the port (#774): a diagonal line that no elbow clears takes a path through the
 * channels between the shapes (`./channels.ts`) instead of going straight through them. Only a
 * spent work budget leaves it straight.
 *
 * Changed in the port: it returns plain data (corners and the label stretch; the renderer draws
 * the path, `./path.ts`), lengths come from the metrics table, outlines are `./shapes.ts`'s
 * (rounded corners included), and the path's arrowhead trims are left to the renderer.
 */
// cspell:ignore kepano
import { channelPath, type Port, type Taken } from './channels.ts';
import { C4_METRICS as M } from './metrics.ts';
import { hit, hitRect, insideAlong, portBox, sidesOf, type Outline, type Sides } from './shapes.ts';
import type { C4RouteKind, Point } from './types.ts';

/** A routed relation: its corners, the stretch its label may sit on, and how to place it. */
export interface Route {
  readonly kind: C4RouteKind;
  /** x, y pairs, from the outline of `a` to the outline of `b`. */
  readonly points: readonly number[];
  /** A self-loop's control points (x, y, x, y). */
  readonly controls?: readonly number[];
  /** The ways the arrowheads at the start and the end point. */
  readonly sdx: number;
  readonly sdy: number;
  readonly edx: number;
  readonly edy: number;
  /** The stretch the label may sit on. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** The side of that stretch the label is pushed to, as a unit vector; zero centres it. */
  readonly nx: number;
  readonly ny: number;
  /** When set, the label stays over the line and moves that way by at most this much. */
  readonly lean: number;
  /** The widest the label should be. */
  readonly room: number;
}

/** Whether a polyline (x, y pairs) crosses the rectangle. */
export function crosses(points: readonly number[], box: Sides): boolean {
  for (let i = 2; i < points.length; i += 2) {
    const px = points[i - 2]!;
    const py = points[i - 1]!;
    if (hitRect(box, { x: px, y: py }, { x: points[i]! - px, y: points[i + 1]! - py }) <= 1)
      return true;
  }
  return false;
}

/**
 * The polyline a relation's label should keep off, as x, y pairs: its corners, or a self-loop's
 * ends and control points (the box its curve stays in).
 */
export function lineOf(points: readonly number[], controls?: readonly number[]): number[] {
  if (!controls || controls.length < 4) return [...points];
  return [points[0]!, points[1]!, ...controls, points[2]!, points[3]!];
}

function contains(outer: Outline, inner: Outline): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.width >= inner.x + inner.width &&
    outer.y + outer.height >= inner.y + inner.height
  );
}

const cx = (b: Outline): number => b.x + b.width / 2;
const cy = (b: Outline): number => b.y + b.height / 2;

/** A straight line: x, y of its start, then of its end. */
type Line = [number, number, number, number];

/** Where on the outer box's nearest side a short line to the inner box starts. */
function nearestSide(outer: Outline, inner: Outline): [number, number] {
  const left = inner.x - outer.x;
  const right = outer.x + outer.width - inner.x - inner.width;
  const top = inner.y - outer.y;
  const bottom = outer.y + outer.height - inner.y - inner.height;
  const least = Math.min(left, right, top, bottom);
  if (least === left || least === right)
    return [least === left ? outer.x : outer.x + outer.width, cy(inner)];
  return [cx(inner), least === bottom ? outer.y + outer.height : outer.y];
}

/** The unit normal of a line, to the left of its way in the drawing; a point reads as level. */
function unitNormal([px, py, qx, qy]: Line): Point {
  const len = Math.hypot(qx - px, qy - py) || 1;
  return { x: -(qy - py) / len, y: (qx - px) / len };
}

/**
 * One box holds the other: a short line from the nearest side of the outer box, moved along
 * that side by `shift` (the outer box is `a` when `down`).
 */
function nestedLine(outer: Outline, inner: Outline, down: boolean, shift: number): Line {
  const [ox, oy] = nearestSide(outer, inner);
  const n = unitNormal([ox, oy, cx(inner), cy(inner)]);
  // `shift` is across the way from a to b, which runs out of the inner box when it is a.
  const s = down ? shift : -shift;
  const [sx, sy] = [ox + n.x * s, oy + n.y * s];
  const [ix, iy] = [cx(inner) + n.x * s, cy(inner) + n.y * s];
  const t = Math.min(hit(inner, { x: sx, y: sy }, { x: ix, y: iy }), 1);
  const mx = sx + (ix - sx) * t;
  const my = sy + (iy - sy) * t;
  return down ? [sx, sy, mx, my] : [mx, my, sx, sy];
}

/**
 * The line between the middles of a and b before any shift. Shapes that share a column or a
 * row are joined by an upright or level line through the shared span. Each shape offers its
 * {@link portBox}: a person beside another shape is joined at its body (D679).
 */
function baseLine(outlineA: Outline, outlineB: Outline): Line {
  const a = portBox(outlineA);
  const b = portBox(outlineB);
  const x0 = Math.max(a.x, b.x);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y0 = Math.max(a.y, b.y);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x0 < x1) return [(x0 + x1) / 2, cy(a), (x0 + x1) / 2, cy(b)];
  if (y0 < y1) return [cx(a), (y0 + y1) / 2, cx(b), (y0 + y1) / 2];
  return [cx(a), cy(a), cx(b), cy(b)];
}

/** The straight line from a to b, shifted sideways by `shift` while it still meets both. */
function apartLine(a: Outline, b: Outline, shift: number): Line {
  let [px, py, qx, qy] = baseLine(a, b);
  const len = Math.hypot(qx - px, qy - py) || 1;
  const nx = (-(qy - py) / len) * shift;
  const ny = ((qx - px) / len) * shift;
  let ta = hit(a, { x: qx + nx, y: qy + ny }, { x: px + nx, y: py + ny });
  let tb = hit(b, { x: px + nx, y: py + ny }, { x: qx + nx, y: qy + ny });
  if (ta <= 1 && tb <= 1) {
    px += nx;
    py += ny;
    qx += nx;
    qy += ny;
  } else {
    [px, py, qx, qy] = [cx(a), cy(a), cx(b), cy(b)];
    ta = Math.min(hit(a, { x: qx, y: qy }, { x: px, y: py }), 1);
    tb = Math.min(hit(b, { x: px, y: py }, { x: qx, y: qy }), 1);
  }
  return [qx + (px - qx) * ta, qy + (py - qy) * ta, px + (qx - px) * tb, py + (qy - py) * tb];
}

/** The straight line from a to b. */
function connect(a: Outline, b: Outline, shift: number): Line {
  const down = contains(a, b);
  if (down || contains(b, a)) return nestedLine(down ? a : b, down ? b : a, down, shift);
  return apartLine(a, b, shift);
}

/**
 * How far the straight line between a and b can move to either side and still meet both
 * outlines: the room the relations between them share (#680). It is how far each point the line
 * runs from (a shape's middle, or the middle of the span two shapes share) can move across the
 * line and stay inside its {@link portBox} (a person's body, D679), the lesser of the two, less
 * `portInset`. Between nested
 * boxes, along the side the short line leaves, from the middle of the inner box.
 */
export function pairRoom(a: Outline, b: Outline): number {
  const down = contains(a, b);
  if (down || contains(b, a)) {
    const inner = down ? b : a;
    const middle = { x: cx(inner), y: cy(inner) };
    const [ox, oy] = nearestSide(down ? a : b, inner);
    const n = unitNormal([ox, oy, middle.x, middle.y]);
    return Math.max(0, Math.min(...insideAlong(inner, middle, n)) - M.portInset);
  }
  const line = baseLine(a, b);
  const n = unitNormal(line);
  const reach = Math.min(
    ...insideAlong(portBox(a), { x: line[0], y: line[1] }, n),
    ...insideAlong(portBox(b), { x: line[2], y: line[3] }, n)
  );
  return Math.max(0, reach - M.portInset);
}

/** The sides of a box a line leaves or reaches. */
export const SIDE = { left: 0, right: 1, top: 2, bottom: 3 } as const;
export type Side = (typeof SIDE)[keyof typeof SIDE];

/**
 * The router's work counter (R-SEC-5, D455): the box and stretch comparisons it has made, against
 * its budget. Once spent, the relations still to route go straight and their labels sit at their
 * middle. Counted, never timed (R-ARCH-6), so the result is the same on every machine.
 */
export class Work {
  spent = 0;
  constructor(readonly budget: number) {}

  charge(n: number): void {
    this.spent += n;
  }

  get done(): boolean {
    return this.spent >= this.budget;
  }
}

/**
 * What the routes drawn so far take up, so that the next keeps apart from them: upright
 * stretches as x, top, bottom; level ones as y, left, right; and where lines leave or reach each
 * side of a shape. Each scan is charged to `work`.
 */
export class Lanes {
  private readonly upright: number[] = [];
  private readonly level: number[] = [];
  private readonly frames: [number[], number[]] = [[], []];
  private readonly taken = new Map<Outline, number[]>();

  constructor(readonly work: Work) {}

  free(upright: boolean, at: number, a0: number, a1: number): boolean {
    const lo = Math.min(a0, a1);
    const hi = Math.max(a0, a1);
    const near = (list: readonly number[], gap: number): boolean => {
      this.work.charge(list.length / 3);
      for (let i = 0; i < list.length; i += 3)
        if (Math.abs(list[i]! - at) < gap && list[i + 1]! < hi && list[i + 2]! > lo) return true;
      return false;
    };
    return (
      !near(upright ? this.upright : this.level, M.near) &&
      !near(this.frames[upright ? 0 : 1], M.frameNear)
    );
  }

  crossings(points: readonly number[]): number {
    let count = 0;
    for (let i = 2; i < points.length; i += 2) {
      const upright = points[i] === points[i - 2];
      const at = upright ? points[i]! : points[i + 1]!;
      const lo = Math.min(
        upright ? points[i - 1]! : points[i - 2]!,
        upright ? points[i + 1]! : points[i]!
      );
      const hi = Math.max(
        upright ? points[i - 1]! : points[i - 2]!,
        upright ? points[i + 1]! : points[i]!
      );
      const list = upright ? this.level : this.upright;
      this.work.charge(list.length / 3);
      for (let j = 0; j < list.length; j += 3)
        if (list[j]! > lo && list[j]! < hi && list[j + 1]! < at && list[j + 2]! > at) count++;
    }
    return count;
  }

  frame(box: Outline): void {
    const { x, y, width: w, height: h } = box;
    this.frames[0].push(x, y, y + h, x + w, y, y + h);
    this.frames[1].push(y, x, x + w, y + h, x, x + w);
  }

  take(points: readonly number[]): void {
    for (let i = 2; i < points.length; i += 2) {
      if (points[i] === points[i - 2])
        this.upright.push(
          points[i]!,
          Math.min(points[i - 1]!, points[i + 1]!),
          Math.max(points[i - 1]!, points[i + 1]!)
        );
      else if (points[i + 1] === points[i - 1])
        this.level.push(
          points[i + 1]!,
          Math.min(points[i - 2]!, points[i]!),
          Math.max(points[i - 2]!, points[i]!)
        );
    }
  }

  /**
   * Where on one side of a shape a line can leave or arrive, between lo and hi: the places clear
   * of the lines already there, nearest `want` first.
   */
  ports(box: Outline, side: Side, want: number, [lo, hi]: readonly [number, number]): number[] {
    const used = this.taken.get(box) ?? [];
    const out: number[] = [];
    for (let k = 0; k < M.portTries && out.length < M.portCandidates; k++) {
      const at = want + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * M.portStep;
      if (at < lo || at > hi) continue;
      let clear = true;
      for (let i = 0; i < used.length; i += 2)
        if (used[i] === side && Math.abs(used[i + 1]! - at) < M.portStep) clear = false;
      if (clear) out.push(at);
    }
    return out.length ? out : [want];
  }

  /** The stretches taken so far (`./channels.ts`'s `Taken`). */
  get stretches(): Taken {
    return { upright: this.upright, level: this.level };
  }

  claim(box: Outline, side: Side, at: number): void {
    const used = this.taken.get(box);
    if (used) used.push(side, at);
    else this.taken.set(box, [side, at]);
  }
}

/** Whether a polyline crosses none of `others` but the ends `a` and `b`; charged to `work`. */
function clearOf(
  points: readonly number[],
  others: readonly Outline[],
  [a, b]: readonly [Outline, Outline],
  work: Work
): boolean {
  work.charge(others.length);
  for (const o of others) if (o !== a && o !== b && crosses(points, sidesOf(o))) return false;
  return true;
}

/** The route for a line with corners through `points`; `along` is the stretch its label sits on. */
function bent(points: number[], along: number, label: Partial<Route>): Route {
  const n = points.length;
  return {
    kind: 'bent',
    points,
    sdx: -Math.sign(points[2]! - points[0]!),
    sdy: -Math.sign(points[3]! - points[1]!),
    edx: Math.sign(points[n - 2]! - points[n - 4]!),
    edy: Math.sign(points[n - 1]! - points[n - 3]!),
    x0: points[along]!,
    y0: points[along + 1]!,
    x1: points[along + 2]!,
    y1: points[along + 3]!,
    nx: 0,
    ny: 0,
    lean: 0,
    room: M.wide,
    ...label,
  };
}

/** Lanes across the gap from lo to hi, the middle first. */
function across(lo: number, hi: number): number[] {
  const out: number[] = [];
  const mid = (lo + hi) / 2;
  const step = Math.max(M.laneStep, (hi - lo) / M.laneSplit);
  for (let k = 0; k < M.acrossTries; k++) {
    const at = mid + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * step;
    if (at >= lo + M.near && at <= hi - M.near) out.push(at);
  }
  return out;
}

/**
 * Ports along a side of `box`, clear of its corners: along y on the left and right (on its
 * {@link portBox}, a person's body, D679), else along x. A `want` outside the side moves to its
 * nearest end.
 */
function portsOn(lanes: Lanes, box: Outline, side: Side, want: number): number[] {
  const upright = side === SIDE.left || side === SIDE.right;
  const port = upright ? portBox(box) : box;
  const lo = upright ? port.y + M.portInset : port.x + M.portInset;
  const hi = upright ? port.y + port.height - M.portInset : port.x + port.width - M.portInset;
  return lanes.ports(box, side, Math.min(hi, Math.max(lo, want)), [lo, hi]);
}

function elbow(
  a: Outline,
  b: Outline,
  others: readonly Outline[],
  lanes: Lanes
): Route | undefined {
  const ax = cx(a);
  const ay = cy(a);
  const bx = cx(b);
  const by = cy(b);
  let best: { points: number[]; cost: number; upright: boolean; sides: [Side, Side] } | undefined;
  const consider = (points: number[], upright: boolean, sides: [Side, Side]): void => {
    // A spent budget ends the search: the line goes straight.
    if (lanes.work.done) return;
    if (!clearOf(points, others, [a, b], lanes.work)) return;
    for (let i = 2; i < points.length; i += 2) {
      const up = points[i] === points[i - 2];
      if (
        !lanes.free(
          up,
          up ? points[i]! : points[i + 1]!,
          up ? points[i - 1]! : points[i - 2]!,
          up ? points[i + 1]! : points[i]!
        )
      )
        return;
    }
    let cost = lanes.crossings(points) * M.elbowCrossingCost;
    for (let i = 2; i < points.length; i += 2)
      cost += Math.abs(points[i]! - points[i - 2]!) + Math.abs(points[i + 1]! - points[i - 1]!);
    if (!best || cost < best.cost) best = { points, cost, upright, sides };
  };
  // Each pair of ports in turn, with each lane across the gap: the first pair with a clear lane wins.
  const search = (
    ports0: readonly number[],
    ports1: readonly number[],
    lanesAcross: readonly number[],
    tryLane: (p0: number, p1: number, lane: number) => void
  ): void => {
    for (const p0 of ports0)
      for (const p1 of ports1) {
        const before = best;
        for (const lane of lanesAcross) {
          tryLane(p0, p1, lane);
          if (best !== before) return;
        }
      }
  };
  if (a.x + a.width <= b.x || b.x + b.width <= a.x) {
    const right = bx > ax;
    const down = Math.sign(by - ay);
    const sides: [Side, Side] = right ? [SIDE.right, SIDE.left] : [SIDE.left, SIDE.right];
    search(
      portsOn(lanes, a, sides[0], ay + (down * a.height) / 4),
      portsOn(lanes, b, sides[1], by - (down * b.height) / 4),
      across(right ? a.x + a.width : b.x + b.width, right ? b.x : a.x),
      (y0, y1, lane) => {
        const x0 = lane + (ax - lane) * Math.min(hit(a, { x: lane, y: y0 }, { x: ax, y: y0 }), 1);
        const x1 = lane + (bx - lane) * Math.min(hit(b, { x: lane, y: y1 }, { x: bx, y: y1 }), 1);
        consider([x0, y0, lane, y0, lane, y1, x1, y1], true, sides);
      }
    );
  }
  if (a.y + a.height <= b.y || b.y + b.height <= a.y) {
    const below = by > ay;
    const sideways = Math.sign(bx - ax);
    const sides: [Side, Side] = below ? [SIDE.bottom, SIDE.top] : [SIDE.top, SIDE.bottom];
    search(
      portsOn(lanes, a, sides[0], ax + (sideways * a.width) / 4),
      portsOn(lanes, b, sides[1], bx - (sideways * b.width) / 4),
      across(below ? a.y + a.height : b.y + b.height, below ? b.y : a.y),
      (x0, x1, lane) => {
        const y0 = lane + (ay - lane) * Math.min(hit(a, { x: x0, y: lane }, { x: x0, y: ay }), 1);
        const y1 = lane + (by - lane) * Math.min(hit(b, { x: x1, y: lane }, { x: x1, y: by }), 1);
        consider([x0, y0, x0, lane, x1, lane, x1, y1], false, sides);
      }
    );
  }
  if (!best) return undefined;
  const { points, upright, sides } = best;
  lanes.take(points);
  lanes.claim(a, sides[0], upright ? points[1]! : points[0]!);
  lanes.claim(b, sides[1], upright ? points[7]! : points[6]!);
  // The label sits on the middle stretch, across the gap.
  return bent(points, 2, { room: upright ? M.narrow : M.wide });
}

/** A self-loop's place among the self-loops on its shape: the `nth` (from 0) of `count`. */
export interface LoopPlace {
  readonly nth: number;
  readonly count: number;
}

const ONE_LOOP: LoopPlace = { nth: 0, count: 1 };

/**
 * Where on `a`'s right side its self-loops end: the middle, and how far from it either way. One
 * loop alone sits at the middle of the box. Several share the stretch the outline has down the
 * side, measured `shapeRadius` in from it (a person's body, not its head) (#680). Both keep
 * `loopSpreadInset` clear of the ends.
 */
function loopStretch(a: Outline, count: number): [number, number] {
  if (count === 1) return [cy(a), Math.max(0, a.height / 2 - M.loopSpreadInset)];
  const at = { x: a.x + a.width - M.shapeRadius, y: cy(a) };
  const [up, down] = insideAlong(a, at, { x: 0, y: 1 });
  return [cy(a) + (down - up) / 2, Math.max(0, (up + down) / 2 - M.loopSpreadInset)];
}

/**
 * A self-loop on the right side of `a`, its ends on the outline. With several loops on one
 * shape (#680), each takes a stretch of the side of its own, the first at the top: their ends
 * are spread evenly down the side, and no loop is taller than one alone. Past
 * `half / near + 1/2` loops (`half` from {@link loopStretch}), their ends are closer than `near`.
 */
function loop(a: Outline, { nth, count }: LoopPlace): Route {
  const [middle, half] = loopStretch(a, count);
  // A loop's ends are `2 * spread` apart, and so is the next loop's first end from its last.
  const spread = Math.min(half / (2 * count - 1), M.loopSpread);
  const x = a.x + a.width;
  const y = middle + (4 * nth - 2 * (count - 1)) * spread;
  const far = x + M.loop;
  const endAt = (yy: number): number =>
    far + (cx(a) - far) * Math.min(hit(a, { x: far, y: yy }, { x: cx(a), y: yy }), 1);
  const sx = endAt(y - spread);
  const ex = endAt(y + spread);
  const len = Math.hypot(M.loop, spread) || 1;
  const ux = M.loop / len;
  const uy = spread / len;
  return {
    kind: 'loop',
    points: [sx, y - spread, ex, y + spread],
    controls: [far, y - spread * 2, far, y + spread * 2],
    sdx: -ux,
    sdy: uy,
    edx: -ux,
    edy: -uy,
    x0: far + M.loopLabelGap,
    y0: y,
    x1: far + M.loopLabelGap,
    y1: y,
    nx: 1,
    ny: 0,
    lean: 0,
    room: M.loopRoom,
  };
}

/** How a relation is routed: its sideways shift, the shapes to steer clear of, and the lanes taken. */
export interface RouteOptions {
  readonly shift: number;
  /** A self-loop's place among the loops on its shape; the only one when left out. */
  readonly loop?: LoopPlace;
  /** Undefined once the budget is spent: the line goes straight. */
  readonly others?: readonly Outline[];
  readonly lanes: Lanes;
}

/**
 * Routes a relation from a to b. `shift` moves the line sideways, off the others between the
 * same two shapes; it stays within their `pairRoom`. `loop` places a self-loop among the others
 * on its shape. `others` are the shapes to steer clear of; undefined skips that check (over the
 * budget). `lanes` holds what the routes before it take up, so that this one keeps apart from them.
 */
export function route(a: Outline, b: Outline, options: RouteOptions): Route {
  const { shift, others, lanes } = options;
  if (a === b) return loop(a, options.loop ?? ONE_LOOP);
  const line = connect(a, b, shift);
  return (others && around({ a, b, others, lanes, line })) ?? straight(line, shift, lanes);
}

/** What going round the shapes in a straight line's way reads. */
interface Around {
  readonly a: Outline;
  readonly b: Outline;
  readonly others: readonly Outline[];
  readonly lanes: Lanes;
  readonly line: Line;
}

/**
 * The way round the shapes in the way of the straight line from a to b: a detour for an upright
 * or level line, else an elbow, else a path through the channels between the shapes. Undefined
 * when nothing is in the way, when one holds the other, when no path is clear, or once the budget
 * is spent.
 */
function around({ a, b, others, lanes, line }: Around): Route | undefined {
  const [sx, sy, ex, ey] = line;
  const inTheWay = (o: Outline): boolean =>
    o !== a && o !== b && hitRect(sidesOf(o), { x: sx, y: sy }, { x: ex - sx, y: ey - sy }) <= 1;
  lanes.work.charge(others.length);
  if (contains(a, b) || contains(b, a) || !others.some(inTheWay)) return undefined;
  const upright = sx === ex;
  if (upright || sy === ey) return detour({ a, b, others, lanes, upright, line, inTheWay });
  return elbow(a, b, others, lanes) ?? channel(a, b, others, lanes);
}

/** The straight line as a route, its label pushed to the side of `shift`. */
function straight(line: Line, shift: number, lanes: Lanes): Route {
  const [sx, sy, ex, ey] = line;
  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const dx = (ex - sx) / len;
  const dy = (ey - sy) / len;
  if (sx === ex || sy === ey) lanes.take([sx, sy, ex, ey]);
  return {
    kind: 'line',
    points: [sx, sy, ex, ey],
    sdx: -dx,
    sdy: -dy,
    edx: dx,
    edy: dy,
    x0: sx,
    y0: sy,
    x1: ex,
    y1: ey,
    nx: Math.sign(shift) * -dy,
    ny: Math.sign(shift) * dx,
    lean: 0,
    room: Math.abs(dx) > Math.abs(dy) ? M.narrow : M.wide,
  };
}

/** What a detour knows: the ends, the shapes, the lanes, and the straight line it replaces. */
interface Detour {
  readonly a: Outline;
  readonly b: Outline;
  readonly others: readonly Outline[];
  readonly lanes: Lanes;
  readonly upright: boolean;
  readonly line: readonly [number, number, number, number];
  readonly inTheWay: (o: Outline) => boolean;
}

/** The side of a box a detour leaves from. */
function detourSide(upright: boolean, forward: boolean): Side {
  if (upright) return forward ? SIDE.right : SIDE.left;
  return forward ? SIDE.bottom : SIDE.top;
}

/** An upright or level line past shapes: a lane round them on one side. */
function detour({ a, b, others, lanes, upright, line, inTheWay }: Detour): Route {
  const [sx, sy, ex, ey] = line;
  const laneOn = (forward: boolean): number => {
    let lane = forward ? -Infinity : Infinity;
    const widen = (box: Outline): void => {
      const edge = upright ? box.x : box.y;
      lane = forward
        ? Math.max(lane, edge + (upright ? box.width : box.height))
        : Math.min(lane, edge);
    };
    widen(a);
    widen(b);
    lanes.work.charge(others.length);
    for (const o of others) if (inTheWay(o)) widen(o);
    return lane;
  };
  const lo = upright ? Math.min(a.y, b.y) : Math.min(a.x, b.x);
  const hi = upright
    ? Math.max(a.y + a.height, b.y + b.height)
    : Math.max(a.x + a.width, b.x + b.width);
  const outside = (forward: boolean, lane: number): boolean => {
    lanes.work.charge(others.length);
    for (const o of others) {
      if (o === a || o === b) continue;
      const near = upright ? o.y < hi && o.y + o.height > lo : o.x < hi && o.x + o.width > lo;
      const start = upright ? o.x : o.y;
      const end = start + (upright ? o.width : o.height);
      if (near && (forward ? end > lane : start < lane)) return false;
    }
    return true;
  };
  const ax = cx(a);
  const ay = cy(a);
  const bx = cx(b);
  const by = cy(b);
  const towards = upright ? Math.sign(by - ay) : Math.sign(bx - ax);
  // The route on one side: each end leaves its shape a quarter of the way from the middle
  // towards the other, clear of the other routes there. The lane runs a little further out for
  // each route already along that gap, and never behind a shape. `step` is how many lanes out
  // it went; one past the last try when none was free.
  const along = (
    forward: boolean
  ): { points: number[]; side: Side; p0: number; p1: number; step: number } => {
    const lane = laneOn(forward);
    const sign = forward ? 1 : -1;
    const side = detourSide(upright, forward);
    const p0 = upright
      ? portsOn(lanes, a, side, ay + (towards * a.height) / 4)[0]!
      : portsOn(lanes, a, side, ax + (towards * a.width) / 4)[0]!;
    const p1 = upright
      ? portsOn(lanes, b, side, by - (towards * b.height) / 4)[0]!
      : portsOn(lanes, b, side, bx - (towards * b.width) / 4)[0]!;
    const pointsAt = (at: number): number[] => {
      if (upright) {
        const x0 = at + (ax - at) * Math.min(hit(a, { x: at, y: p0 }, { x: ax, y: p0 }), 1);
        const x1 = at + (bx - at) * Math.min(hit(b, { x: at, y: p1 }, { x: bx, y: p1 }), 1);
        return [x0, p0, at, p0, at, p1, x1, p1];
      }
      const y0 = at + (ay - at) * Math.min(hit(a, { x: p0, y: at }, { x: p0, y: ay }), 1);
      const y1 = at + (by - at) * Math.min(hit(b, { x: p1, y: at }, { x: p1, y: by }), 1);
      return [p0, y0, p0, at, p1, at, p1, y1];
    };
    let points = pointsAt(lane + sign * M.lane);
    for (let k = 0; k <= M.laneTries; k++) {
      const at = lane + sign * (M.lane + k * M.laneStep);
      const tried = pointsAt(at);
      if (!clearOf(tried, others, [a, b], lanes.work)) continue;
      points = tried;
      if (lanes.free(upright, at, p0, p1)) return { points, side, p0, p1, step: k };
    }
    return { points, side, p0, p1, step: M.laneTries + 1 };
  };
  // A detour takes the outside of the drawing when only one side is outside, leaving the gaps
  // between columns and rows to the relations that cross them. Otherwise it takes the side
  // where it crosses fewer lines, then the one where it runs nearer its shapes.
  const natural = upright ? ey > sy : ex < sx;
  const out = outside(natural, laneOn(natural));
  const back = outside(!natural, laneOn(!natural));
  const first = along(natural);
  const other = out === back ? along(!natural) : undefined;
  const cost = (way: { points: number[]; step: number }): number =>
    lanes.crossings(way.points) * M.detourCrossingCost + way.step;
  let forward = natural;
  if (back && !out) forward = !natural;
  else if (other && cost(other) < cost(first)) forward = !natural;
  const { points, side, p0, p1 } = forward === natural ? first : (other ?? along(!natural));
  const sign = forward ? 1 : -1;
  lanes.take(points);
  lanes.claim(a, side, p0);
  lanes.claim(b, side, p1);
  return bent(points, 2, upright ? { nx: sign, lean: M.lean, room: M.narrow } : { room: M.wide });
}

/** Where on `side` of `box` a line towards `to` would leave: a quarter of the way from the middle. */
function portToward(lanes: Lanes, box: Outline, side: Side, to: Outline): Port & { at: number } {
  const sideways = side === SIDE.left || side === SIDE.right;
  const want = sideways
    ? cy(box) + (Math.sign(cy(to) - cy(box)) * box.height) / 4
    : cx(box) + (Math.sign(cx(to) - cx(box)) * box.width) / 4;
  const at = portsOn(lanes, box, side, want)[0]!;
  if (side === SIDE.left) return { x: box.x, y: at, dx: -1, dy: 0, at };
  if (side === SIDE.right) return { x: box.x + box.width, y: at, dx: 1, dy: 0, at };
  if (side === SIDE.top) return { x: at, y: box.y, dx: 0, dy: -1, at };
  return { x: at, y: box.y + box.height, dx: 0, dy: 1, at };
}

/**
 * Each stretch of a path but its first and last moved off the lanes other routes took, a lane
 * step at a time either way while the path stays clear of the shapes, as a detour's lane moves.
 */
function settle(
  path: number[],
  others: readonly Outline[],
  ends: [Outline, Outline],
  lanes: Lanes
): number[] {
  let points = path;
  for (let i = 2; i + 4 < points.length; i += 2) {
    const upright = points[i] === points[i + 2];
    const c = upright ? 0 : 1;
    const at = points[i + c]!;
    const [s0, s1] = [points[i + 1 - c]!, points[i + 3 - c]!];
    if (lanes.free(upright, at, s0, s1)) continue;
    for (let k = 1; k <= 2 * M.laneTries; k++) {
      const moved = at + (k & 1 ? 1 : -1) * Math.ceil(k / 2) * M.laneStep;
      const tried = [...points];
      tried[i + c] = moved;
      tried[i + 2 + c] = moved;
      if (clearOf(tried, others, ends, lanes.work) && lanes.free(upright, moved, s0, s1)) {
        points = tried;
        break;
      }
    }
  }
  return points;
}

/** The end of the stretch from (px, py) into `box` along `port`'s line, on the box's outline. */
function onOutline(box: Outline, port: Port, px: number, py: number): [number, number] {
  const qx = port.dx ? cx(box) : px;
  const qy = port.dx ? py : cy(box);
  const t = Math.min(hit(box, { x: px, y: py }, { x: qx, y: qy }), 1);
  return [px + (qx - px) * t, py + (qy - py) * t];
}

/**
 * A path from a to b through the channels between the shapes (`./channels.ts`), for a diagonal
 * line that no elbow clears (#774). It may leave and reach any side, at the port an elbow would
 * take there; its stretches move off the lanes other routes took; its label sits on its longest
 * stretch between two bends. Undefined when no path is clear, or once the budget is spent.
 */
function channel(
  a: Outline,
  b: Outline,
  others: readonly Outline[],
  lanes: Lanes
): Route | undefined {
  const sides: Side[] = [SIDE.left, SIDE.right, SIDE.top, SIDE.bottom];
  const starts = sides.map((side) => portToward(lanes, a, side, b));
  const ends = sides.map((side) => portToward(lanes, b, side, a));
  const blocks = [...others, ...[a, b].filter((o) => !others.includes(o))];
  const found = channelPath({ starts, ends, blocks, taken: lanes.stretches }, lanes.work);
  if (!found) return undefined;
  const points = settle(found.points, others, [a, b], lanes);
  const n = points.length;
  const start = starts[found.start]!;
  const end = ends[found.end]!;
  [points[0], points[1]] = onOutline(a, start, points[2]!, points[3]!);
  [points[n - 2], points[n - 1]] = onOutline(b, end, points[n - 4]!, points[n - 3]!);
  if (!clearOf(points, others, [a, b], lanes.work)) return undefined;
  lanes.take(points);
  lanes.claim(a, sides[found.start]!, start.at);
  lanes.claim(b, sides[found.end]!, end.at);
  // The label's stretch: the longest between two bends, or the longest of all on a path of two.
  let along = n > 6 ? 2 : 0;
  const length = (i: number): number =>
    Math.abs(points[i + 2]! - points[i]!) + Math.abs(points[i + 3]! - points[i + 1]!);
  for (let i = along; i + (n > 6 ? 6 : 4) <= n; i += 2) if (length(i) > length(along)) along = i;
  return bent(points, along, { room: points[along] === points[along + 2] ? M.narrow : M.wide });
}

/** The corners of a route as points. */
export function pointsOf(flat: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
  return out;
}
