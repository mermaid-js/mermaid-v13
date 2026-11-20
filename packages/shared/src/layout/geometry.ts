/**
 * Plane geometry the custom layouts share, next to `RectUnion`: the boxes a layout adds to its
 * bounds and checks its drawing against.
 */
import type { Rect } from './bounds.ts';

/** The square around the disc of radius `r` about `center`. */
export function discBox(center: { readonly x: number; readonly y: number }, r: number): Rect {
  return { x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r };
}

/** How much taller than one line a measured label is: 0 for one line (or none). */
export function extraLines(text: { readonly height: number; readonly lineHeight: number }): number {
  return Math.max(0, text.height - text.lineHeight);
}
