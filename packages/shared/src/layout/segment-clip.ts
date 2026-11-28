/**
 * Liang–Barsky clipping of a segment against an axis-aligned box, for the layouts and layout
 * checks that ask whether a line runs through a shape or a label. Its own chunk.
 */

/** A box by its sides. */
export interface Sides {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A point, or a vector. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

/**
 * The part of the segment from `p` by `d` that lies in the closed box, as `[enter, leave]`,
 * fractions of `d` from 0 to 1; undefined when the segment misses the box. A segment that only
 * touches the box gives `enter === leave`.
 */
export function clipSegment(
  { x: px, y: py }: Vec,
  { x: dx, y: dy }: Vec,
  { x0, y0, x1, y1 }: Sides
): readonly [number, number] | undefined {
  let enter = 0;
  let leave = 1;
  for (const [d, room] of [
    [-dx, px - x0],
    [dx, x1 - px],
    [-dy, py - y0],
    [dy, y1 - py],
  ] as const) {
    if (d === 0) {
      if (room < 0) return undefined;
    } else if (d < 0) enter = Math.max(enter, room / d);
    else leave = Math.min(leave, room / d);
  }
  return enter <= leave ? [enter, leave] : undefined;
}
