/**
 * Geometry the two theme families share (D152), from v12 12.2.0 `markers.js` and
 * `lineWithOffset.ts`. The redux themes carry v12 `look: neo` geometry, the classic themes
 * v12 classic geometry. Sizes are in px; a gap is the space between the node outline and the
 * nearest point of the arrowhead.
 */
import type { ArrowheadVariable } from '../vocabulary.ts';

/**
 * v12 neo (`*-margin` markers). Point: viewBox 11.5×14 met into 10.5×14, so 10.5 long and
 * 14×10.5/11.5 ≈ 12.78 wide, tip at the line end, which `markerOffsets.arrow_point` puts 4
 * before the outline. Circle: viewBox 10 into 14, refX 12.25, so the gap is 2.25×1.4. Cross:
 * viewBox 15 into 12, refX 17.7 past the arm end at 14, so the gap is 3.7×0.8.
 */
export const NEO_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
  circleArrowheadSize: 14,
  circleArrowheadGap: 3.15,
  crossArrowheadSize: 12,
  crossArrowheadGap: 2.96,
  crossArrowheadStrokeWidth: 2.5,
};

/**
 * v12 classic. Point: viewBox 10 into 8×8, refX 5, so the tip lands on the outline after the
 * line's 4px shortening. Circle: viewBox 10 into 11, refX 11, gap 1×1.1. Cross: viewBox 11
 * into 11, refX 12 past the arm end at 10, gap 2.
 */
export const CLASSIC_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
  circleArrowheadSize: 11,
  circleArrowheadGap: 1.1,
  crossArrowheadSize: 11,
  crossArrowheadGap: 2,
  crossArrowheadStrokeWidth: 2,
};
