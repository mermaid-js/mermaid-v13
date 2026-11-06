/**
 * The fold, the horizon, the cliff and the confusion ellipse, as v12's `cynefinBoundaries.ts`
 * computes them (:52-169, `mermaid@12.2.0`), returned as points instead of path strings. Each
 * number is computed with v12's operations in v12's order, so after `num()` rounding the paths
 * equal v12's (`packages/conformance/src/cynefin/boundaries.spec.ts`).
 */
import { CANVAS, CLIFF, ELLIPSE_STROKE_WIDTH, WAVES as W } from './metrics.ts';
import { seededRandom } from './random.ts';
import type { CubicCurve, CubicSegment, CynefinEllipse, Point } from './types.ts';

/** Alternating control directions: up (or right) on even segments. */
const direction = (i: number): number => (i % 2 === 0 ? 1 : -1);

/**
 * The fold: the vertical boundary at `width / 2`, top to bottom, in 7 cubic segments. Point `i`
 * jitters by `rand(seed + 17i)·2a − a`; both control points sit at the segment's middle height,
 * offset by `1.5a · ±1 · rand(seed + 31i + 7)`. Amplitude 0 gives straight cubic segments.
 */
export function foldCurve(
  width: number,
  height: number,
  seed: number,
  amplitude: number
): CubicCurve {
  const cx = width / 2;
  const step = height / W.segments;
  const points: Point[] = [];
  for (let i = 0; i <= W.segments; i++) {
    const jitter = seededRandom(seed + i * W.foldJitterStep) * amplitude * W.jitterSpan - amplitude;
    points.push({ x: cx + jitter, y: i * step });
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i < W.segments; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midY = (p0.y + p1.y) / 2;
    const offset =
      amplitude *
      W.controlShare *
      direction(i) *
      seededRandom(seed + i * W.foldControlStep + W.foldControlOffset);
    segments.push({ c1: { x: p0.x + offset, y: midY }, c2: { x: p1.x - offset, y: midY }, to: p1 });
  }
  return { from: points[0]!, segments };
}

/**
 * The horizon: the horizontal boundary at `height / 2`, left to right. v12's renderer seeds it
 * with `seed + 100`, then `23i` and `37i + 11`; the control points share the segment's middle x.
 */
export function horizonCurve(
  width: number,
  height: number,
  seed: number,
  amplitude: number
): CubicCurve {
  const s = seed + W.horizonSeedOffset;
  const cy = height / 2;
  const step = width / W.segments;
  const points: Point[] = [];
  for (let i = 0; i <= W.segments; i++) {
    const jitter = seededRandom(s + i * W.horizonJitterStep) * amplitude * W.jitterSpan - amplitude;
    points.push({ x: i * step, y: cy + jitter });
  }
  const segments: CubicSegment[] = [];
  for (let i = 0; i < W.segments; i++) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const midX = (p0.x + p1.x) / 2;
    const offset =
      amplitude *
      W.controlShare *
      direction(i) *
      seededRandom(s + i * W.horizonControlStep + W.horizonControlOffset);
    segments.push({ c1: { x: midX, y: p0.y + offset }, c2: { x: midX, y: p1.y - offset }, to: p1 });
  }
  return { from: points[0]!, segments };
}

/**
 * The cliff: not seeded. An S from the centre to the bottom edge with amplitude `0.03·width`,
 * in two cubic segments.
 */
export function cliffCurve(width: number, height: number): CubicCurve {
  const cx = width / 2;
  const top = height * CLIFF.top;
  const amplitude = width * CLIFF.amplitude;
  const at = ([fx, fy]: readonly [number, number]): Point => ({
    x: cx + amplitude * fx,
    y: top + (height - top) * fy,
  });
  const [a, b, c] = CLIFF.first;
  const [d, e, f] = CLIFF.second;
  return {
    from: { x: cx, y: top },
    segments: [
      { c1: at(a), c2: at(b), to: at(c) },
      { c1: at(d), c2: at(e), to: at(f) },
    ],
  };
}

/** The confusion ellipse: centred on the canvas, radii `0.15·width` and `0.15·height`. */
export function confusionEllipse(width: number, height: number): CynefinEllipse {
  return {
    center: { x: width / 2, y: height / 2 },
    rx: width * CANVAS.ellipseRadius,
    ry: height * CANVAS.ellipseRadius,
    strokeWidth: ELLIPSE_STROKE_WIDTH,
  };
}
