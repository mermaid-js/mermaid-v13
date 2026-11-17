// Edge paths from layout routes, trimmed at each end for an end marker (DESIGN §7.1).
// Ported from Pele's src/svg/edges.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT,
// (c) 2026 kepano): `routePath`. The one route drawing every graph diagram shares.
// cspell:ignore kepano
import type { EdgeRouting, RoutePoint } from '@mermaid-js/core/layout';
import type { PathData, SvgWriter } from '@mermaid-js/core/svg';

// How far an edge runs straight before a marker at its end, where it has the room.
const LEAD = 6;
// How far from the marker room at the end of a leg `stepBefore` and `stepAfter` put their step
// (less where the leg is short).
const STEP_INSET = 12;
// The radius of the arc at a corner of a rounded route (v12's `rounded` curve), less where a
// leg is too short for it.
const RADIUS = 5;
// How far the handles of a wide turn reach along its two legs.
const HANDLE = 0.62;

// The d3 curve names of v12's `flowchart.curve` enum with no step: drawn as S-curves.
const D3_CURVES: ReadonlySet<string> = new Set([
  'basis',
  'bumpX',
  'bumpY',
  'cardinal',
  'catmullRom',
  'monotoneX',
  'monotoneY',
  'natural',
]);

/** How the line between two route points is drawn, from the v12 `curve` name. */
export type CurveKind = 'curved' | 'linear' | 'step' | 'stepBefore' | 'stepAfter' | 'rounded';

/** The warning for a `curve` name that is none of the {@link CurveKind}s (D602). */
export interface CurveWarning {
  readonly code: 'CURVE_UNKNOWN';
  readonly message: string;
}

/**
 * The curve kind for a v12 `curve` name. A name that is not drawn otherwise is drawn `curved`:
 * a d3 curve factory name (`basis`, `cardinal`, …) silently, any other name with a
 * `CURVE_UNKNOWN` warning to `warn` (D602). Use {@link curveReporter} to warn once per name.
 */
export function curveKind(
  curve: string | undefined,
  warn?: (warning: CurveWarning) => void
): CurveKind {
  if (curve === undefined || D3_CURVES.has(curve)) return 'curved';
  if (curve === 'linear' || curve === 'rounded') return curve;
  if (curve === 'step' || curve === 'stepBefore' || curve === 'stepAfter') return curve;
  warn?.({
    code: 'CURVE_UNKNOWN',
    message: `Unknown curve "${curve}": edges are drawn with S-curves (curve: basis)`,
  });
  return 'curved';
}

/** {@link curveKind} for one render: each unknown name is reported once, however many edges use it. */
export function curveReporter(
  warn: (warning: CurveWarning) => void
): (curve: string | undefined) => CurveKind {
  const seen = new Set<string>();
  return (curve) =>
    curveKind(curve, (w) => {
      if (curve === undefined || seen.has(curve)) return;
      seen.add(curve);
      warn(w);
    });
}

/** How the layout engine routes edges drawn with this curve: right angles but for two. */
export function curveRouting(kind: CurveKind): EdgeRouting {
  if (kind === 'linear') return 'straight';
  return kind === 'curved' ? 'curved' : 'stepped';
}

export interface EdgePath {
  d: PathData;
  /** Start tip and the way a start marker points. */
  sx: number;
  sy: number;
  sdx: number;
  sdy: number;
  /** End tip and the way an end marker points. */
  ex: number;
  ey: number;
  edx: number;
  edy: number;
}

// The S-curve handle factor of the layered engine's `ease`.
const ease = (across: number, along: number): number =>
  Math.max(0.25, Math.min(0.5, (4 * Math.abs(along)) / (Math.abs(across) || 1)));

// Where a step curve turns between two coordinates: near the start, near the end or halfway.
// `startTrim` and `endTrim` are the marker room at each end, which the step stays clear of.
function stepCorner(
  kind: CurveKind,
  from: number,
  to: number,
  startTrim: number,
  endTrim: number
): number {
  const sign = Math.sign(to - from);
  // The step stays clear of the marker room, and (on a short leg) within a quarter of what is left.
  const inset = Math.min(STEP_INSET, Math.max(0, Math.abs(to - from) - startTrim - endTrim) / 4);
  if (kind === 'stepBefore') return from + sign * (startTrim + inset);
  if (kind === 'stepAfter') return to - sign * (endTrim + inset);
  return (from + to) / 2;
}

/**
 * A route that goes along, across and along again, with the across leg moved to where
 * `stepBefore` or `stepAfter` turns. Any other route stays as the engine routed it.
 */
function movedStep(
  kind: CurveKind,
  route: readonly RoutePoint[],
  startTrim: number,
  endTrim: number
): readonly RoutePoint[] {
  if (kind === 'step' || route.length !== 4) return route;
  const [a, b, c, d] = route as [RoutePoint, RoutePoint, RoutePoint, RoutePoint];
  const eq = (u: number, v: number): boolean => Math.abs(u - v) < 0.01;
  if (eq(a.x, b.x) && eq(b.y, c.y) && eq(c.x, d.x)) {
    const y = stepCorner(kind, a.y, d.y, startTrim, endTrim);
    return [a, { ...b, y }, { ...c, y }, d];
  }
  if (eq(a.y, b.y) && eq(b.x, c.x) && eq(c.y, d.y)) {
    const x = stepCorner(kind, a.x, d.x, startTrim, endTrim);
    return [a, { ...b, x }, { ...c, x }, d];
  }
  return route;
}

const near = (ax: number, ay: number, bx: number, by: number): boolean =>
  Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;

/** A route's points (stepped routes with their turns added) and the tests on its legs. */
class Legs {
  readonly xs: number[] = [];
  readonly ys: number[] = [];
  /** 1 where the point's leg runs across (`axis: 'h'`), else 0. */
  readonly axes: number[] = [];
  last = 0;
  /** The unit vector {@link unit} found. */
  ux = 0;
  uy = 0;
  private readonly linear: boolean;

  constructor(
    readonly kind: CurveKind,
    route: readonly RoutePoint[],
    startTrim: number,
    endTrim: number
  ) {
    this.linear = kind === 'linear';
    const stepped = kind === 'step' || kind === 'stepBefore' || kind === 'stepAfter';
    const points = stepped ? movedStep(kind, route, startTrim, endTrim) : route;
    for (const [i, p] of points.entries()) {
      const axis = p.axis === 'h' ? 1 : 0;
      // Only the first leg has marker room at its start, and the last at its end.
      if (stepped) {
        this.step(p, axis, i === 1 ? startTrim : 0, i === points.length - 1 ? endTrim : 0);
      }
      this.xs.push(p.x);
      this.ys.push(p.y);
      this.axes.push(axis);
    }
    this.last = this.xs.length - 1;
  }

  /** Adds the turn of a stepped route between the last point and p, where they are not in line. */
  private step(p: RoutePoint, axis: number, startTrim: number, endTrim: number): void {
    const last = this.xs.length - 1;
    if (last < 0) return;
    const px = this.xs[last]!;
    const py = this.ys[last]!;
    const offset = Math.abs(p.x - px) >= 0.01 && Math.abs(p.y - py) >= 0.01;
    if (!offset) return;
    // The turn: along then across, or across then along.
    if (axis === 0) {
      const ty = stepCorner(this.kind, py, p.y, startTrim, endTrim);
      this.turn(px, ty, px, py, p, axis);
      this.turn(p.x, ty, px, py, p, axis);
      return;
    }
    const tx = stepCorner(this.kind, px, p.x, startTrim, endTrim);
    this.turn(tx, py, px, py, p, axis);
    this.turn(tx, p.y, px, py, p, axis);
  }

  private turn(x: number, y: number, px: number, py: number, p: RoutePoint, axis: number): void {
    if (near(x, y, px, py) || near(x, y, p.x, p.y)) return;
    this.xs.push(x);
    this.ys.push(y);
    this.axes.push(axis);
  }

  x(i: number): number {
    return this.xs[i]!;
  }

  y(i: number): number {
    return this.ys[i]!;
  }

  aligned(i: number): boolean {
    return Math.abs(this.x(i) - this.x(i - 1)) < 0.01 || Math.abs(this.y(i) - this.y(i - 1)) < 0.01;
  }

  straight(i: number): boolean {
    return this.linear || this.kind === 'rounded' || this.aligned(i);
  }

  /** Sets ({@link ux}, {@link uy}) to the way the line leaves point i towards point j. */
  unit(i: number, j: number, axis: number): void {
    if (!this.straight(Math.max(i, j))) {
      this.ux = axis === 0 ? 0 : Math.sign(this.x(j) - this.x(i)) || 1;
      this.uy = axis === 0 ? Math.sign(this.y(j) - this.y(i)) || 1 : 0;
      return;
    }
    const dx = this.x(j) - this.x(i);
    const dy = this.y(j) - this.y(i);
    const len = Math.hypot(dx, dy) || 1;
    this.ux = dx / len;
    this.uy = dy / len;
  }

  length(i: number): number {
    return Math.abs(this.x(i) - this.x(i - 1)) + Math.abs(this.y(i) - this.y(i - 1));
  }

  /** Whether the route turns a right angle at point i. */
  turns(i: number): boolean {
    return (
      !this.linear &&
      i > 0 &&
      i < this.last &&
      this.aligned(i) &&
      this.aligned(i + 1) &&
      this.length(i) >= 0.01 &&
      this.length(i + 1) >= 0.01 &&
      Math.abs(this.x(i) - this.x(i - 1)) < 0.01 !== Math.abs(this.x(i + 1) - this.x(i)) < 0.01
    );
  }

  /** Whether point i lies part of the way along one straight run, where it adds nothing. */
  midRun(i: number): boolean {
    if (i >= this.last || !this.aligned(i) || !this.aligned(i + 1)) return false;
    const x = this.x(i);
    const y = this.y(i);
    return (
      (x - this.x(i - 1)) * (this.x(i + 1) - x) + (y - this.y(i - 1)) * (this.y(i + 1) - y) > 0
    );
  }

  /** How far leg i runs along (ux, uy). */
  along(i: number, ux: number, uy: number): number {
    return (
      Math.abs(this.x(i) - this.x(i - 1)) * Math.abs(ux) +
      Math.abs(this.y(i) - this.y(i - 1)) * Math.abs(uy)
    );
  }

  insert(at: number, x: number, y: number, axis: number): void {
    this.xs.splice(at, 0, x);
    this.ys.splice(at, 0, y);
    this.axes.splice(at, 0, axis);
    this.last++;
  }
}

// A curve into a marker runs straight for a little way first, where there is room.
const lead = (run: number): number => Math.min(LEAD, run / 4);

/**
 * The path for a route, trimmed at both ends to leave room for markers. Between two points
 * not in line the route is one S along the flow (or a step in a stepped route); where the
 * route turns a corner it is rounded.
 */
export function routePath(
  w: SvgWriter,
  route: readonly RoutePoint[],
  kind: CurveKind,
  startTrim: number,
  endTrim: number
): EdgePath {
  const r = new Legs(kind, route, startTrim, endTrim);
  const { xs, ys, axes } = r;
  let last = r.last;
  r.unit(0, 1, axes[1] ?? 0);
  const sdx = r.ux;
  const sdy = r.uy;
  r.unit(last - 1, last, axes[last] ?? 0);
  const edx = r.ux;
  const edy = r.uy;
  const sx = r.x(0);
  const sy = r.y(0);
  const ex = r.x(last);
  const ey = r.y(last);
  xs[0] = sx + sdx * startTrim;
  ys[0] = sy + sdy * startTrim;
  xs[last] = ex - edx * endTrim;
  ys[last] = ey - edy * endTrim;
  const arrives =
    endTrim > 0 && (!r.straight(last) || r.turns(last - 1)) ? lead(r.along(last, edx, edy)) : 0;
  const leaves = startTrim > 0 && (!r.straight(1) || r.turns(1)) ? lead(r.along(1, sdx, sdy)) : 0;
  if (arrives >= 1) {
    r.insert(last, r.x(last) - edx * arrives, r.y(last) - edy * arrives, axes[last]!);
    last++;
  }
  if (leaves >= 1) {
    r.insert(1, r.x(0) + sdx * leaves, r.y(0) + sdy * leaves, axes[1]!);
    last++;
  }
  return { d: draw(w, r, kind), sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}

/** The pen drawing a route: the path so far and where it has reached. */
class Pen {
  private readonly b: ReturnType<SvgWriter['path']>;
  private atX: number;
  private atY: number;
  private readonly stepped: boolean;

  constructor(
    w: SvgWriter,
    private readonly r: Legs,
    private readonly kind: CurveKind
  ) {
    this.stepped = kind === 'step' || kind === 'stepBefore' || kind === 'stepAfter';
    this.atX = r.x(0);
    this.atY = r.y(0);
    this.b = w.path().moveTo(this.atX, this.atY);
  }

  lineTo(x: number, y: number): void {
    if (near(x, y, this.atX, this.atY)) return;
    this.b.lineTo(x, y);
    this.atX = x;
    this.atY = y;
  }

  /** One S along the flow to point i, which is not in line with the point before it. */
  sweep(i: number): void {
    const { atX, atY } = this;
    const x = this.r.x(i);
    const y = this.r.y(i);
    const down = this.r.axes[i] === 0;
    const run = down ? y - atY : x - atX;
    const k = Math.abs(run) * ease(down ? x - atX : y - atY, run);
    const ux = down ? 0 : Math.sign(run) * k;
    const uy = down ? Math.sign(run) * k : 0;
    this.b.curveTo(atX + ux, atY + uy, x - ux, y - uy, x, y);
    this.atX = x;
    this.atY = y;
  }

  /** The rounded right-angle turn at point i. */
  corner(i: number): void {
    const { r, kind } = this;
    const x = r.x(i);
    const y = r.y(i);
    // A step curve turns at the point itself: a right angle, radius 0.
    if (this.stepped) {
      this.lineTo(x, y);
      return;
    }
    let before = r.turns(i - 1) ? r.length(i) / 2 : r.length(i);
    let after = r.turns(i + 1) ? r.length(i + 1) / 2 : r.length(i + 1);
    if (kind === 'rounded') before = after = Math.min(RADIUS, before, after);
    r.unit(i - 1, i, r.axes[i]!);
    const ux = r.ux;
    const uy = r.uy;
    r.unit(i, i + 1, r.axes[i + 1]!);
    const vx = r.ux;
    const vy = r.uy;
    this.lineTo(x - ux * before, y - uy * before);
    const atX = x + vx * after;
    const atY = y + vy * after;
    this.atX = atX;
    this.atY = atY;
    // A right-angle turn, so the arc's radius is its leg; the sweep follows the turn (y down).
    if (kind === 'rounded') {
      this.b.arcTo(before, before, 0, false, ux * vy - uy * vx > 0, atX, atY);
    } else {
      this.b.curveTo(
        x - ux * before * (1 - HANDLE),
        y - uy * before * (1 - HANDLE),
        x + vx * after * (1 - HANDLE),
        y + vy * after * (1 - HANDLE),
        atX,
        atY
      );
    }
  }

  done(): PathData {
    return this.b.done();
  }
}

/** The path data through a route's points: S-curves between offset points, corners rounded. */
function draw(w: SvgWriter, r: Legs, kind: CurveKind): PathData {
  const pen = new Pen(w, r, kind);
  for (let i = 1; i <= r.last; i++) {
    if (!r.straight(i)) pen.sweep(i);
    else if (r.turns(i)) pen.corner(i);
    else if (!r.midRun(i)) pen.lineTo(r.x(i), r.y(i));
  }
  return pen.done();
}
