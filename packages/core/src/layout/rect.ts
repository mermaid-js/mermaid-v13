/** Rectangle helpers the custom layouts share. */

/** A rectangle by its top-left corner. */
export interface RectLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** `r` grown by `by` on every side: a stroke's outer half, or a padding band. */
export function growRect(r: RectLike, by: number): RectLike {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}
