/**
 * Small geometry helpers of the ishikawa layout and its invariants: boxes, their union, and the
 * head's outline (v12's quadratic).
 */
import type { Point, Rect, Segment } from './types.ts';

/** The smallest rectangle holding `points`. */
export function pointsBox(points: readonly Point[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The smallest rectangle holding every one of `boxes`; a zero box at the origin for none. */
export function boxUnion(boxes: readonly Rect[]): Rect {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  return pointsBox(
    boxes.flatMap((b) => [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
    ])
  );
}

/** `box` grown by `d` on every side. */
export const grown = (box: Rect, d: number): Rect => ({
  x: box.x - d,
  y: box.y - d,
  width: box.width + 2 * d,
  height: box.height + 2 * d,
});

/** A segment's box. */
export const segmentBox = (s: Segment): Rect =>
  pointsBox([
    { x: s.x1, y: s.y1 },
    { x: s.x2, y: s.y2 },
  ]);

/** The box of the quadratic from `p0` through control `c` to `p2`, its extremes included. */
export function quadBox(p0: Point, c: Point, p2: Point): Rect {
  const points = [p0, p2];
  for (const axis of ['x', 'y'] as const) {
    const den = p0[axis] - 2 * c[axis] + p2[axis];
    if (den === 0) continue;
    const t = (p0[axis] - c[axis]) / den;
    if (t > 0 && t < 1) {
      const at = (a: number, b: number, d: number): number =>
        (1 - t) * (1 - t) * a + 2 * t * (1 - t) * b + t * t * d;
      points.push({ x: at(p0.x, c.x, p2.x), y: at(p0.y, c.y, p2.y) });
    }
  }
  return pointsBox(points);
}
