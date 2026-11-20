/**
 * Small plane geometry shared by the layout and its invariants: a text's drawn corners (its box
 * turned about its anchor) and the union box the bounds are grown from.
 */
import { RectUnion } from '@mermaid-js/shared/layout';
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

/** The union of what is drawn: shared `RectUnion`, with the shapes wardley adds to it. */
export class Box extends RectUnion {
  point(point: Point): void {
    this.add({ x: point.x, y: point.y, width: 0, height: 0 });
  }
  /** The square around the disc of radius `r` about `center`. */
  addDisc(center: Point, r: number): void {
    this.add({ x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r });
  }
  /** A line `width` wide, as the squares about its ends. */
  line(from: Point, to: Point, width: number): void {
    this.addDisc(from, width / 2);
    this.addDisc(to, width / 2);
  }
  /** A rectangle outlined `stroke` wide. */
  framed(r: Rect, stroke: number): void {
    const half = stroke / 2;
    this.add({ x: r.x - half, y: r.y - half, width: r.width + stroke, height: r.height + stroke });
  }
  text(t: PlacedText): void {
    for (const p of textCorners(t)) this.point(p);
  }
}
