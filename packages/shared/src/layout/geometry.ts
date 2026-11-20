/** Plane geometry the custom layouts share. */
import type { Rect } from './bounds.ts';

/** `r` grown by `by` on every side: a stroke's outer half, or a padding band. */
export function growRect(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}
