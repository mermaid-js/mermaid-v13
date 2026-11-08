/**
 * Small plane geometry shared by the layout and its invariants: a text's drawn corners (its box
 * turned about its anchor) and the union box the bounds are grown from.
 */
import type { PlacedText, Point, Rect } from './types.ts';

/** Half a turn, in degrees: a unit, not a length. */
export const HALF_TURN = 180;
const DEGREES = Math.PI / HALF_TURN;

/** `point` turned `degrees` clockwise (SVG's y points down) about `centre`. */
function rotated(point: Point, centre: Point, degrees: number): Point {
  if (degrees === 0) return point;
  const a = degrees * DEGREES;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = point.x - centre.x;
  const dy = point.y - centre.y;
  return { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos };
}

/** A rectangle's corners, clockwise from the top left. */
function rectCorners(r: Rect): [Point, Point, Point, Point] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
}

/** Where a text's box is drawn: its corners turned by its rotation about its anchor. */
export function textCorners(t: PlacedText): Point[] {
  return rectCorners(t).map((p) => rotated(p, t.at, t.rotate));
}

/** The union of what is drawn. */
export class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  /** A rectangle; a negative width or height counts from the other side. */
  add(r: Rect): void {
    this.point({ x: r.x, y: r.y });
    this.point({ x: r.x + r.width, y: r.y + r.height });
  }
  point(point: Point): void {
    this.x0 = Math.min(this.x0, point.x);
    this.y0 = Math.min(this.y0, point.y);
    this.x1 = Math.max(this.x1, point.x);
    this.y1 = Math.max(this.y1, point.y);
  }
  /** The square around the disc of radius `r` about `center`. */
  disc(center: Point, r: number): void {
    this.add({ x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r });
  }
  /** A line `width` wide, as the squares about its ends. */
  line(from: Point, to: Point, width: number): void {
    this.disc(from, width / 2);
    this.disc(to, width / 2);
  }
  /** A rectangle outlined `stroke` wide. */
  framed(r: Rect, stroke: number): void {
    const half = stroke / 2;
    this.add({ x: r.x - half, y: r.y - half, width: r.width + stroke, height: r.height + stroke });
  }
  text(t: PlacedText): void {
    for (const p of textCorners(t)) this.point(p);
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
