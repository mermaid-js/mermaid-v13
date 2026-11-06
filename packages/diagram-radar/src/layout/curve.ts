/**
 * v12's `closedRoundCurve` (`renderer.ts:185-207`), re-implemented without d3 (R-PERF-2): the
 * closed Catmull-Rom spline through `points` as cubic Bézier segments. For each `i`, from `p₁ = points[i]`
 * to `p₂ = points[i + 1]`: `c1 = p₁ + (p₂ − p₀)·t`, `c2 = p₂ − (p₃ − p₁)·t`, indices mod `n`.
 */
import type { CubicSegment, Point } from './types.ts';

export function closedRoundCurve(points: readonly Point[], tension: number): CubicSegment[] {
  const n = points.length;
  const at = (i: number): Point => points[(i + n) % n]!;
  const out: CubicSegment[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    out.push({
      c1: { x: p1.x + (p2.x - p0.x) * tension, y: p1.y + (p2.y - p0.y) * tension },
      c2: { x: p2.x - (p3.x - p1.x) * tension, y: p2.y - (p3.y - p1.y) * tension },
      to: p2,
    });
  }
  return out;
}

/**
 * v12's `relativeRadius` (`renderer.ts:175-183`): `value` clamped to `[min, max]`, scaled to
 * `[0, radius]`. Never NaN (D356): an empty range (`max = min`, v12's NaN) is the centre; a value
 * at an end of the range lands there, so a 309-digit entry (Infinity) at an Infinity `max` is on
 * the radius; a share past a double (a finite value over an Infinity range) is the centre.
 */
export function relativeRadius(value: number, min: number, max: number, radius: number): number {
  if (!(max > min || max < min)) return 0;
  const clipped = Math.min(Math.max(value, min), max);
  if (clipped === max) return radius;
  if (clipped === min) return 0;
  // Divided first, so huge values do not overflow.
  const share = (clipped - min) / (max - min);
  return Number.isFinite(share) ? radius * share : 0;
}
