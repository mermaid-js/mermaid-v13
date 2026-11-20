/**
 * A block's outline as plain data (D446's geometry half), in the block's own frame: about its
 * centre, y down. Four kinds cover every block shape:
 *
 * - `rect`: a `width × height` box with corners rounded by `rx` (square, round, subroutine,
 *   stadium with `rx = height / 2`, composite);
 * - `polygon`: the points in order (diamond, hexagon, odd, lean, trapezoids, block arrow);
 * - `ellipse`: `rx × ry` (circle, double circle's outer ring);
 * - `cylinder`: a `width × height` box whose top and bottom are half-ellipses `ry` deep.
 *
 * {@link clipOutline} is where a ray from the centre leaves the outline: edges are clipped there
 * (D441). {@link outlineDistance} is how far a point is from the outline, for the invariants.
 */
import { boxExit } from '@mermaid-js/core/layout/box-exit';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Outline =
  | { readonly kind: 'rect'; readonly width: number; readonly height: number; readonly rx: number }
  | { readonly kind: 'polygon'; readonly points: readonly Point[] }
  | { readonly kind: 'ellipse'; readonly rx: number; readonly ry: number }
  | {
      readonly kind: 'cylinder';
      readonly width: number;
      readonly height: number;
      readonly ry: number;
    };

/** The outline's extent about the centre: `[minX, minY, maxX, maxY]`. */
export function outlineExtent(o: Outline): [number, number, number, number] {
  switch (o.kind) {
    case 'rect':
    case 'cylinder':
      return [-o.width / 2, -o.height / 2, o.width / 2, o.height / 2];
    case 'ellipse':
      return [-o.rx, -o.ry, o.rx, o.ry];
    case 'polygon': {
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of o.points) {
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      }
      return o.points.length > 0 ? [x0, y0, x1, y1] : [0, 0, 0, 0];
    }
  }
}

/** How far along the unit ray `(dx, dy)` from the centre it leaves an ellipse about `(0, cy)`. */
function ellipseExit(rx: number, ry: number, cy: number, dx: number, dy: number): number {
  if (rx <= 0 || ry <= 0) return 0;
  // (t·dx / rx)² + ((t·dy − cy) / ry)² = 1, the larger root.
  const a = (dx / rx) ** 2 + (dy / ry) ** 2;
  const b = (-2 * dy * cy) / (ry * ry);
  const c = (cy / ry) ** 2 - 1;
  const disc = b * b - 4 * a * c;
  return disc < 0 ? 0 : Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
}

/** The farthest crossing of the unit ray `(dx, dy)` with the polygon's sides. */
function polygonExit(points: readonly Point[], dx: number, dy: number): number {
  let best = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (den === 0) continue;
    const t = (a.x * ey - a.y * ex) / den;
    const u = (a.x * dy - a.y * dx) / den;
    if (t > best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

/** A rounded box: the box's exit, pulled in onto the corner's circle when it lands in one. */
function roundedExit(w: number, h: number, rx: number, dx: number, dy: number): number {
  const hw = w / 2;
  const hh = h / 2;
  const t = boxExit(hw, hh, dx, dy);
  const r = Math.min(rx, hw, hh);
  if (r <= 0) return t;
  const x = Math.abs(t * dx);
  const y = Math.abs(t * dy);
  if (x <= hw - r || y <= hh - r) return t;
  // The ray through the corner circle about (hw − r, hh − r): the larger root.
  const cx = hw - r;
  const cy = hh - r;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const b = -2 * (ax * cx + ay * cy);
  const c = cx * cx + cy * cy - r * r;
  const disc = b * b - 4 * c;
  return disc < 0 ? t : (-b + Math.sqrt(disc)) / 2;
}

/**
 * Where the ray from the centre towards `(dx, dy)` (any length) leaves the outline, in the
 * block's frame. A zero direction, or an outline with no area, gives the centre.
 */
export function clipOutline(o: Outline, dx: number, dy: number): Point {
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return { x: 0, y: 0 };
  const ux = dx / len;
  const uy = dy / len;
  let t: number;
  switch (o.kind) {
    case 'rect':
      t = roundedExit(o.width, o.height, o.rx, ux, uy);
      break;
    case 'ellipse':
      t = ellipseExit(o.rx, o.ry, 0, ux, uy);
      break;
    case 'polygon':
      t = o.points.length >= 3 ? polygonExit(o.points, ux, uy) : 0;
      break;
    case 'cylinder': {
      const ry = Math.min(o.ry, o.height / 2);
      const body = boxExit(o.width / 2, o.height / 2 - ry, ux, uy);
      const capY = o.height / 2 - ry;
      t = Math.max(
        body,
        ellipseExit(o.width / 2, ry, -capY, ux, uy),
        ellipseExit(o.width / 2, ry, capY, ux, uy)
      );
      break;
    }
  }
  return Number.isFinite(t) ? { x: t * ux, y: t * uy } : { x: 0, y: 0 };
}

const segmentDistance = (p: Point, a: Point, b: Point): number => {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2));
  return Math.hypot(p.x - a.x - k * ex, p.y - a.y - k * ey);
};

/** The signed distance from a rounded box's edge: negative inside. */
function roundedSigned(w: number, h: number, rx: number, p: Point): number {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  const qx = Math.abs(p.x) - (w / 2 - r);
  const qy = Math.abs(p.y) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** The signed distance from an ellipse about `(0, cy)`, to first order: negative inside. */
function ellipseSigned(rx: number, ry: number, cy: number, p: Point): number {
  if (rx <= 0 || ry <= 0) return Math.hypot(p.x, p.y - cy);
  const k = Math.hypot(p.x / rx, (p.y - cy) / ry);
  return (k - 1) * Math.min(rx, ry);
}

/**
 * How far `p` (in the block's frame) is from the outline. For an ellipse it is first order,
 * exact on the outline itself, which is what the invariants ask.
 */
export function outlineDistance(o: Outline, p: Point): number {
  switch (o.kind) {
    case 'rect':
      return Math.abs(roundedSigned(o.width, o.height, o.rx, p));
    case 'ellipse':
      return Math.abs(ellipseSigned(o.rx, o.ry, 0, p));
    case 'polygon': {
      if (o.points.length === 0) return Math.hypot(p.x, p.y);
      let d = Infinity;
      for (let i = 0; i < o.points.length; i++) {
        d = Math.min(d, segmentDistance(p, o.points[i]!, o.points[(i + 1) % o.points.length]!));
      }
      return d;
    }
    case 'cylinder': {
      const ry = Math.min(o.ry, o.height / 2);
      const capY = o.height / 2 - ry;
      // The union's signed distance: the least of its parts'.
      return Math.abs(
        Math.min(
          roundedSigned(o.width, o.height - 2 * ry, 0, p),
          ellipseSigned(o.width / 2, ry, -capY, p),
          ellipseSigned(o.width / 2, ry, capY, p)
        )
      );
    }
  }
}
