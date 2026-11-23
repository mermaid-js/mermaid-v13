/**
 * v12's bang (`bang.ts` under `rendering-util/rendering-elements/shapes/`) as absolute
 * elliptical arcs, built as the cloud is (`@mermaid-js/shared/shapes/outline`, which flowchart
 * shares). The numbers are v12's proportions of the frame, not lengths; `layout-literals.spec.ts`
 * leaves this file out.
 */
import { fromCorner, type Outline } from '@mermaid-js/shared/shapes/outline';

/**
 * `bang.ts`: fourteen arcs round a `w` × `h` frame (v12's `effectiveWidth` × `effectiveHeight`),
 * of radius `0.15 · arcWidth` (`r · 0.8` mid-side). v12 took the radius from its width before the
 * least growth (`w = bbox.width + 10 · halfPadding`), so `arcWidth` is that width.
 */
export function bangOutline(w: number, h: number, arcWidth = w): Outline {
  const r = 0.15 * arcWidth;
  const s = r * 0.8;
  return fromCorner(w, h, false, [
    [r, r, 1, w * 0.25, -h * 0.1],
    [r, r, 1, w * 0.25, 0],
    [r, r, 1, w * 0.25, 0],
    [r, r, 1, w * 0.25, h * 0.1],
    [r, r, 1, w * 0.15, h * 0.33],
    [s, s, 1, 0, h * 0.34],
    [r, r, 1, -w * 0.15, h * 0.33],
    [r, r, 1, -w * 0.25, h * 0.15],
    [r, r, 1, -w * 0.25, 0],
    [r, r, 1, -w * 0.25, 0],
    [r, r, 1, -w * 0.25, -h * 0.15],
    [r, r, 1, -w * 0.1, -h * 0.33],
    [s, s, 1, 0, -h * 0.34],
    [r, r, 1, w * 0.1, -h * 0.33],
  ]);
}
