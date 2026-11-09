/**
 * The d3 parts v12's chart builder used, re-implemented without d3 (spec #426 §Package, R-PERF-2):
 * d3-array 3.2.4's `ticks`, d3-scale 4.0.2's `scaleLinear` (two-point domain, no clamp) and
 * `scaleBand` with `paddingInner(1)`, `paddingOuter(0)` and `align(0.5)`, and d3-shape 3.2.0's
 * `line()` with its linear curve and default 3 decimals. Each follows d3's arithmetic step for
 * step, so the values are d3's bit for bit (`packages/conformance/src/xychart/ticks-parity.spec.ts`).
 * Numbers here are d3's, not lengths.
 */
import type { Point } from './types.ts';

const E10 = Math.sqrt(50);
const E5 = Math.sqrt(10);
const E2 = Math.sqrt(2);

/** d3-array `tickSpec`: the first and last tick index and the increment (negative: 1/step). */
function tickSpec(start: number, stop: number, count: number): [number, number, number] {
  const step = (stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step));
  const error = step / Math.pow(10, power);
  let factor = 1;
  if (error >= E10) factor = 10;
  else if (error >= E5) factor = 5;
  else if (error >= E2) factor = 2;
  let i1: number;
  let i2: number;
  let inc: number;
  if (power < 0) {
    inc = Math.pow(10, -power) / factor;
    i1 = Math.round(start * inc);
    i2 = Math.round(stop * inc);
    if (i1 / inc < start) ++i1;
    if (i2 / inc > stop) --i2;
    inc = -inc;
  } else {
    inc = Math.pow(10, power) * factor;
    i1 = Math.round(start / inc);
    i2 = Math.round(stop / inc);
    if (i1 * inc < start) ++i1;
    if (i2 * inc > stop) --i2;
  }
  if (i2 < i1 && 0.5 <= count && count < 2) return tickSpec(start, stop, count * 2);
  return [i1, i2, inc];
}

/** d3-array `ticks(start, stop, count)`: round values from `start` towards `stop`. */
export function ticks(start: number, stop: number, count: number): number[] {
  if (!(count > 0)) return [];
  if (start === stop) return [start];
  const reverse = stop < start;
  const [i1, i2, inc] = reverse ? tickSpec(stop, start, count) : tickSpec(start, stop, count);
  if (!(i2 >= i1)) return [];
  const n = i2 - i1 + 1;
  const out = new Array<number>(n);
  for (let i = 0; i < n; ++i) {
    const k = reverse ? i2 - i : i1 + i;
    out[i] = inc < 0 ? k / -inc : k * inc;
  }
  return out;
}

/** d3-scale `scaleLinear().domain(domain).range(range)`: d3's two-point map with `interpolateNumber`. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number]
): (value: number) => number {
  let [d0, d1] = domain;
  let [r0, r1] = range;
  if (d1 < d0) {
    [d0, d1] = [d1, d0];
    [r0, r1] = [r1, r0];
  }
  const span = d1 - d0;
  // d3 `normalize`: an empty domain maps everything to the middle.
  const t = span ? (x: number): number => (x - d0) / span : (): number => 0.5;
  return (x) => {
    const k = t(x);
    return r0 * (1 - k) + r1 * k;
  };
}

/**
 * d3-scale `scaleBand().domain(domain).range(range).paddingInner(1).paddingOuter(0).align(0.5)`:
 * a point scale over the de-duplicated domain, ends on the range ends, one value centred.
 * `undefined` for a value not in the domain (v12 then draws at the range start).
 */
export function bandScale(
  domain: readonly string[],
  range: readonly [number, number]
): (value: string) => number | undefined {
  const unique = [...new Set(domain)];
  const n = unique.length;
  const [r0, r1] = range;
  const reverse = r1 < r0;
  let start = reverse ? r1 : r0;
  const stop = reverse ? r0 : r1;
  // d3 `rescale` with paddingInner 1, paddingOuter 0 and align 0.5.
  const step = (stop - start) / Math.max(1, n - 1);
  start += (stop - start - step * (n - 1)) * 0.5;
  const values = unique.map((_, i) => start + step * i);
  if (reverse) values.reverse();
  const at = new Map(unique.map((v, i) => [v, values[i]!]));
  return (value) => at.get(value);
}

/** d3-path's default rounding for shapes: 3 decimals. */
const round = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * d3-shape `line()` over `points` with the linear curve: `M` then `L` for each run of defined
 * points, `Z` closing a run of one point; an `undefined` entry ends a run (d3's `defined`).
 * Empty when no point is defined (d3 returns null).
 */
export function linePath(points: readonly (Point | undefined)[]): string {
  let out = '';
  let run = 0;
  const end = (): void => {
    if (run === 1) out += 'Z';
    run = 0;
  };
  for (const p of points) {
    if (p === undefined) {
      end();
      continue;
    }
    out += `${run === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`;
    run++;
  }
  end();
  return out;
}
