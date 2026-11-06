/**
 * d3's `pie()`, `arc()` and `centroid()` (d3-shape 3), re-implemented for the pie layout and
 * renderer (spec #288, R-PERF-2): no padding, no corner radius, angles in radians clockwise
 * from 12 o'clock.
 */
import { pathBuilder, type PathBuilder, type PathData } from '@mermaid-js/core/svg';
import type { Point } from './types.ts';

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
/** d3-shape's `epsilon`: radii and angles closer than this count as equal. */
const EPSILON = 1e-12;

export interface PieAngles {
  readonly startAngle: number;
  readonly endAngle: number;
}

/**
 * d3 `pie().sort(null)` over `values`: input order, from 0 to 2π, each angle in proportion to
 * its value. A zero sum gives every slice zero angles, as d3 does.
 */
export function pieAngles(values: readonly number[]): PieAngles[] {
  let sum = 0;
  for (const v of values) if (v > 0) sum += v;
  const k = sum ? TAU / sum : 0;
  const out: PieAngles[] = [];
  let a0 = 0;
  for (const v of values) {
    const a1 = a0 + (v > 0 ? v * k : 0);
    out.push({ startAngle: a0, endAngle: a1 });
    a0 = a1;
  }
  return out;
}

/** d3 `arc().centroid()`: the middle of the arc between `inner` and `outer`, about (0, 0). */
export function centroid(a: PieAngles, inner: number, outer: number): Point {
  const r = (inner + outer) / 2;
  const t = (a.startAngle + a.endAngle) / 2 - HALF_PI;
  return { x: Math.cos(t) * r, y: Math.sin(t) * r };
}

/**
 * d3 `arc()`'s path for a slice about (0, 0): the outer arc, then the inner arc back, or the
 * centre without a hole. A slice of the whole circle is two half arcs (and a ring with a hole),
 * as d3-path draws it.
 */
export function slicePath(a: PieAngles, inner: number, outer: number): PathData {
  let r0 = inner;
  let r1 = outer;
  if (r1 < r0) [r0, r1] = [r1, r0];
  const p = pathBuilder();
  const a0 = a.startAngle - HALF_PI;
  const a1 = a.endAngle - HALF_PI;
  const da = Math.abs(a1 - a0);
  const cw = a1 > a0;
  const at = (r: number, t: number): [number, number] => [r * Math.cos(t), r * Math.sin(t)];
  if (!(r1 > EPSILON)) return p.moveTo(0, 0).done();
  if (da > TAU - EPSILON) {
    circle(p, r1, a0, cw);
    if (r0 > EPSILON) circle(p, r0, a1, !cw);
    return p.close().done();
  }
  const [x01, y01] = at(r1, a0);
  const [x11, y11] = at(r1, a1);
  p.moveTo(x01, y01).arcTo(r1, r1, 0, da >= Math.PI, cw, x11, y11);
  if (r0 > EPSILON) {
    const [x10, y10] = at(r0, a1);
    const [x00, y00] = at(r0, a0);
    p.lineTo(x10, y10).arcTo(r0, r0, 0, da >= Math.PI, !cw, x00, y00);
  } else p.lineTo(0, 0);
  return p.close().done();
}

/** A whole circle of radius `r` from angle `t`, as d3-path's two half arcs. */
function circle(p: PathBuilder, r: number, t: number, sweep: boolean): void {
  const x = r * Math.cos(t);
  const y = r * Math.sin(t);
  p.moveTo(x, y).arcTo(r, r, 0, true, sweep, -x, -y).arcTo(r, r, 0, true, sweep, x, y);
}
