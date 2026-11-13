/**
 * Where a boundary's header sits along its frame's top (spec #730 §Layout). The engine reserves
 * the band and the width but not the spot: a relation into a boundary's child crosses the top
 * edge, usually at the middle, where a centred title is. The header slides along the band to the
 * free stretch nearest the middle, as a relation's label slides along its line; it stays centred
 * where no stretch is free (then the layout reports nothing: a crowded frame, as legacy C4's
 * `crowded` labels).
 */
import type { Point, Rect } from '../layout/types.ts';
import { C4_BETA_METRICS as B } from './metrics.ts';

/** The stretch of x where the segment p-q lies within the band `y0`..`y1`; none if it never does. */
function segmentSpan(p: Point, q: Point, y0: number, y1: number): [number, number] | undefined {
  if (p.y === q.y) {
    return p.y >= y0 && p.y <= y1 ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : undefined;
  }
  const tA = (y0 - p.y) / (q.y - p.y);
  const tB = (y1 - p.y) / (q.y - p.y);
  const lo = Math.max(0, Math.min(tA, tB));
  const hi = Math.min(1, Math.max(tA, tB));
  if (lo > hi) return undefined;
  const xa = p.x + (q.x - p.x) * lo;
  const xb = p.x + (q.x - p.x) * hi;
  return [Math.min(xa, xb), Math.max(xa, xb)];
}

/** What a header in the band `y0`..`y1` must keep clear of: x stretches, cleared by `headClear`. */
export function blockedStretches(
  lines: readonly (readonly Point[])[],
  boxes: readonly Rect[],
  band: readonly [number, number]
): [number, number][] {
  const [y0, y1] = band;
  const out: [number, number][] = [];
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const span = segmentSpan(line[i - 1]!, line[i]!, y0, y1);
      if (span) out.push(span);
    }
  for (const b of boxes) if (b.y < y1 && b.y + b.height > y0) out.push([b.x, b.x + b.width]);
  return out.map(([a, b]) => [a - B.headClear, b + B.headClear]);
}

/**
 * The centre for a header `width` wide inside `lo`..`hi`: `preferred` when it is clear, else the
 * clear centre nearest it; `preferred` again when no stretch is wide enough.
 */
export function headerCentre(
  span: readonly [number, number],
  width: number,
  blocked: readonly (readonly [number, number])[],
  preferred: number
): number {
  const [lo, hi] = span;
  const sorted = [...blocked].sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let from = lo;
  for (const [a, b] of sorted) {
    if (a > from) gaps.push([from, Math.min(a, hi)]);
    from = Math.max(from, b);
  }
  if (from < hi) gaps.push([from, hi]);
  let best: number | undefined;
  for (const [a, b] of gaps) {
    if (b - a < width) continue;
    const centre = Math.min(Math.max(preferred, a + width / 2), b - width / 2);
    if (best === undefined || Math.abs(centre - preferred) < Math.abs(best - preferred))
      best = centre;
  }
  return best ?? preferred;
}
