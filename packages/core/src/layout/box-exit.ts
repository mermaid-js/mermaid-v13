/**
 * How far along the ray `(dx, dy)` from the centre of an axis-aligned box of half sizes `hw`
 * and `hh` it leaves the box, in multiples of `(dx, dy)`. A zero component never reaches the
 * sides parallel to it (no 0 / 0 for a box of no width or height); with both zero the result
 * is `Infinity`, so each caller keeps its own fallback for a ray of no direction.
 */
export function boxExit(hw: number, hh: number, dx: number, dy: number): number {
  const tx = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty = dy === 0 ? Infinity : hh / Math.abs(dy);
  return Math.min(tx, ty);
}
