/**
 * Extents of what the layout draws, for its bounds (D361) and the invariants: exact boxes of
 * cubic and quadratic Bézier curves (the curve, not its control polygon, so the bounds grow
 * only where something is drawn), and a box that unions them.
 */
import type { CubicCurve, Point, Rect } from './types.ts';

/** The [min, max] of one coordinate of a cubic Bézier with these four values. */
function cubicRange(p0: number, p1: number, p2: number, p3: number): [number, number] {
  let lo = Math.min(p0, p3);
  let hi = Math.max(p0, p3);
  // B'(t) / 3 = a t² + b t + c.
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots: number[] = [];
  if (a === 0) {
    if (b !== 0) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  for (const t of roots) {
    if (!(t > 0 && t < 1)) continue;
    const u = 1 - t;
    const v = u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return [lo, hi];
}

/** The [min, max] of one coordinate of a quadratic Bézier. */
function quadRange(p0: number, p1: number, p2: number): [number, number] {
  let lo = Math.min(p0, p2);
  let hi = Math.max(p0, p2);
  const d = p0 - 2 * p1 + p2;
  if (d !== 0) {
    const t = (p0 - p1) / d;
    if (t > 0 && t < 1) {
      const u = 1 - t;
      const v = u * u * p0 + 2 * u * t * p1 + t * t * p2;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  }
  return [lo, hi];
}

const rectOf = ([x0, x1]: [number, number], [y0, y1]: [number, number]): Rect => ({
  x: x0,
  y: y0,
  width: x1 - x0,
  height: y1 - y0,
});

/** `r` grown by `by` on every side. */
export function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** The box of a cubic curve. */
export function cubicBox(curve: CubicCurve): Rect {
  const box = new Box();
  let p = curve.from;
  for (const s of curve.segments) {
    box.add(
      rectOf(cubicRange(p.x, s.c1.x, s.c2.x, s.to.x), cubicRange(p.y, s.c1.y, s.c2.y, s.to.y))
    );
    p = s.to;
  }
  if (curve.segments.length === 0) box.add({ ...p, width: 0, height: 0 });
  return box.rect();
}

/** The box of a quadratic curve. */
export function quadBox(start: Point, control: Point, end: Point): Rect {
  return rectOf(quadRange(start.x, control.x, end.x), quadRange(start.y, control.y, end.y));
}

/** The box of some points. */
export function pointsBox(points: readonly Point[]): Rect {
  const box = new Box();
  for (const p of points) box.add({ ...p, width: 0, height: 0 });
  return box.rect();
}

/** The union of rectangles. */
export class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
