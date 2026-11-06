/**
 * The outlines of v12's cloud and bang shapes (`cloud.ts`, `bang.ts` under
 * `rendering-util/rendering-elements/shapes/`) as absolute elliptical arcs, and the box an
 * outline covers. v12 drew each path from the top-left corner of its `w` × `h` frame and sized
 * the node from the drawn path's `getBBox()` (`updateNodeBounds`), so the arcs bulge out of the
 * frame and the node is that bulging box. The layout sizes those nodes with {@link outlineBox};
 * the renderer draws the same arcs.
 *
 * The numbers here are v12's proportions of the frame and the arc geometry of SVG's elliptical
 * arc (SVG 1.1 appendix F.6), not lengths; `layout-literals.spec.ts` leaves this file out.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** An SVG elliptical arc to an absolute end point (`A rx ry rotation large sweep x y`). */
export interface OutlineArc {
  readonly rx: number;
  readonly ry: number;
  /** x-axis rotation, in degrees. */
  readonly rotation: number;
  readonly large: boolean;
  readonly sweep: boolean;
  readonly x: number;
  readonly y: number;
}

/** A closed path: `M start`, the arcs, `Z` (the last arc ends at `start`). */
export interface Outline {
  readonly start: Point;
  readonly arcs: readonly OutlineArc[];
}

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** `[rx, ry, rotation, dx, dy]`: one relative arc of v12's path. */
type Step = readonly [number, number, number, number, number];

/** v12's relative arcs from the frame's top-left corner, made absolute in a frame centred at 0. */
function outline(w: number, h: number, sweep: boolean, steps: readonly Step[]): Outline {
  const start = { x: -w / 2, y: -h / 2 };
  let { x, y } = start;
  const arcs = steps.map(([rx, ry, rotation, dx, dy]) => {
    x += dx;
    y += dy;
    return { rx, ry, rotation, large: false, sweep, x, y };
  });
  return { start, arcs };
}

/** `cloud.ts`: ten arcs round a `w` × `h` frame, radii in proportion to `w`. */
export function cloudOutline(w: number, h: number): Outline {
  const r1 = 0.15 * w;
  const r2 = 0.25 * w;
  const r3 = 0.35 * w;
  const r4 = 0.2 * w;
  return outline(w, h, true, [
    [r1, r1, 0, w * 0.25, -w * 0.1],
    [r3, r3, 1, w * 0.4, -w * 0.1],
    [r2, r2, 1, w * 0.35, w * 0.2],
    [r1, r1, 1, w * 0.15, h * 0.35],
    [r4, r4, 1, -w * 0.15, h * 0.65],
    [r2, r1, 1, -w * 0.25, w * 0.15],
    [r3, r3, 1, -w * 0.5, 0],
    [r1, r1, 1, -w * 0.25, -w * 0.15],
    [r1, r1, 1, -w * 0.1, -h * 0.35],
    [r4, r4, 1, w * 0.1, -h * 0.65],
  ]);
}

/** `bang.ts`: fourteen arcs of radius `0.15 w` round a `w` × `h` frame (`r · 0.8` mid-side). */
export function bangOutline(w: number, h: number): Outline {
  const r = 0.15 * w;
  const s = r * 0.8;
  return outline(w, h, false, [
    [r, r, 1, w * 0.25, -h * 0.1],
    [r, r, 1, w * 0.25, 0],
    [r, r, 1, w * 0.25, 0],
    [r, r, 1, w * 0.25, h * 0.1],
    [r, r, 1, w * 0.15, h * 0.33],
    [s, s, 1, 0, h * 0.34],
    [r, r, 1, -w * 0.15, h * 0.33],
    [r, r, 1, -w * 0.25, h * 0.15],
    [r, r, 1, -w * 0.25, 0],
    [r, r, 1, -w * 0.25, 0],
    [r, r, 1, -w * 0.25, -h * 0.15],
    [r, r, 1, -w * 0.1, -h * 0.33],
    [s, s, 1, 0, -h * 0.34],
    [r, r, 1, w * 0.1, -h * 0.33],
  ]);
}

const TAU = 2 * Math.PI;

/** The signed angle from `(ux, uy)` to `(vx, vy)`. */
const angle = (ux: number, uy: number, vx: number, vy: number): number =>
  Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);

/**
 * The box an arc from `from` covers: its end points and the extremes of its ellipse that lie on
 * it, with radii too small for the chord scaled up and a zero radius drawn as a line (F.6.6).
 */
export function arcBox(from: Point, a: OutlineArc): Box {
  const box = { x0: Math.min(from.x, a.x), y0: Math.min(from.y, a.y) };
  const out = { ...box, x1: Math.max(from.x, a.x), y1: Math.max(from.y, a.y) };
  let rx = Math.abs(a.rx);
  let ry = Math.abs(a.ry);
  if (rx === 0 || ry === 0 || (from.x === a.x && from.y === a.y)) return out;
  const phi = (a.rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const hx = (from.x - a.x) / 2;
  const hy = (from.y - a.y) / 2;
  const x1 = cos * hx + sin * hy;
  const y1 = -sin * hx + cos * hy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (a.large === a.sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (from.x + a.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (from.y + a.y) / 2;
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!a.sweep && dt > 0) dt -= TAU;
  if (a.sweep && dt < 0) dt += TAU;
  const on = (t: number): boolean => {
    const along = ((((t - t1) * Math.sign(dt)) % TAU) + TAU) % TAU;
    return along <= Math.abs(dt);
  };
  const tx = Math.atan2(-ry * sin, rx * cos);
  const ty = Math.atan2(ry * cos, rx * sin);
  for (const t of [tx, tx + Math.PI, ty, ty + Math.PI]) {
    if (!on(t)) continue;
    const px = cx + rx * cos * Math.cos(t) - ry * sin * Math.sin(t);
    const py = cy + rx * sin * Math.cos(t) + ry * cos * Math.sin(t);
    out.x0 = Math.min(out.x0, px);
    out.x1 = Math.max(out.x1, px);
    out.y0 = Math.min(out.y0, py);
    out.y1 = Math.max(out.y1, py);
  }
  return out;
}

/** The box a closed outline covers. */
export function outlineBox(o: Outline): Box {
  let box: Box = { x0: o.start.x, y0: o.start.y, x1: o.start.x, y1: o.start.y };
  let at = o.start;
  for (const a of o.arcs) {
    const b = arcBox(at, a);
    box = {
      x0: Math.min(box.x0, b.x0),
      y0: Math.min(box.y0, b.y0),
      x1: Math.max(box.x1, b.x1),
      y1: Math.max(box.y1, b.y1),
    };
    at = a;
  }
  return box;
}
