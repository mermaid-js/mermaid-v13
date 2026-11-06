/**
 * Geometry the two theme families share (D151, D152). The redux themes carry v12 `look: neo`
 * geometry, the classic themes v12 classic geometry.
 *
 * Arrowheads come from v12 12.2.0 `markers.js` and `lineWithOffset.ts`. Sizes are in px; a gap
 * is the space between the node outline and the nearest point of the arrowhead.
 *
 * Node padding in the classic themes follows the diagram's `padding` config
 * (`flowchart.padding`). Circles keep v13's earlier redux values, and hexagon padding is
 * applied X to width and Y to height (v12 swaps them). Subroutine, cylinder, lean / trapezoid
 * and asymmetric shapes have their own v12 padding (`subroutine.ts`, `cylinder.ts`,
 * `leanRight.ts`, `trapezoid.ts`, `rectLeftInvArrow.ts` at fa796a943), as totals; the rounded
 * rectangle takes `padding` per side in every theme, so it has no variable.
 */
import type { ArrowheadVariable, TokenVariable } from '../vocabulary.ts';

/**
 * v12 neo (`*-margin` markers). Point: viewBox 11.5×14 met into 10.5×14, so 10.5 long and
 * 14×10.5/11.5 ≈ 12.78 wide, tip at the line end, which `markerOffsets.arrow_point` puts 4
 * before the outline. Circle: viewBox 10 into 14, refX 12.25, so the gap is 2.25×1.4. Cross:
 * viewBox 15 into 12 (scale 0.8), arms from 1 to 14 so 13×0.8 = 10.4 drawn, stroke 2.5×0.8,
 * refX 17.7 past the arm end at 14, so the gap is 3.7×0.8.
 */
export const NEO_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
  circleArrowheadSize: 14,
  circleArrowheadGap: 3.15,
  crossArrowheadSize: 10.4,
  crossArrowheadGap: 2.96,
  crossArrowheadStrokeWidth: 2,
  // ER `zero_or_more_neo`: the circle's centre 28 out (refX 39, cx 11; the start copy has 27.5).
  erZeroOrMoreCircleOffset: 28,
};

/**
 * v12 classic. Point: viewBox 10 into 8×8, refX 5, so the tip lands on the outline after the
 * line's 4px shortening. Circle: viewBox 10 into 11, refX 11, gap 1×1.1. Cross: viewBox 11
 * into 11, arms from 1 to 10 so 9 drawn, refX 12 past the arm end at 10, gap 2.
 */
export const CLASSIC_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
  circleArrowheadSize: 11,
  circleArrowheadGap: 1.1,
  crossArrowheadSize: 9,
  crossArrowheadGap: 2,
  crossArrowheadStrokeWidth: 2,
  // ER `zero_or_more`: refX 39, cx 9.
  erZeroOrMoreCircleOffset: 30,
};

type PaddingToken = Extract<
  TokenVariable,
  | 'nodePaddingX'
  | 'nodePaddingY'
  | 'stadiumPaddingX'
  | 'stadiumPaddingY'
  | 'hexagonPaddingX'
  | 'hexagonPaddingY'
  | 'hexagonSlant'
  | 'doubleCircleGap'
  | 'doubleCirclePadding'
  | 'circlePadding'
  | 'circleMinDiameter'
  | 'subroutinePaddingX'
  | 'subroutinePaddingY'
  | 'cylinderPaddingX'
  | 'cylinderPaddingY'
  | 'leanPaddingX'
  | 'leanPaddingY'
  | 'oddPaddingX'
  | 'oddPaddingY'
>;

export const REDUX_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: 16,
  nodePaddingY: 12,
  stadiumPaddingX: 40,
  stadiumPaddingY: 24,
  hexagonPaddingX: 70,
  hexagonPaddingY: 32,
  hexagonSlant: 3.5,
  doubleCircleGap: 12,
  doubleCirclePadding: 16,
  circlePadding: 16,
  circleMinDiameter: 44,
  subroutinePaddingX: 28,
  subroutinePaddingY: 12,
  cylinderPaddingX: 24,
  cylinderPaddingY: 24,
  leanPaddingX: '2 * padding',
  leanPaddingY: 'padding',
  // v12 neo: 21 / 12 per side.
  oddPaddingX: 42,
  oddPaddingY: 24,
};

export const CLASSIC_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: '2 * padding',
  nodePaddingY: 'padding',
  stadiumPaddingX: 'padding',
  stadiumPaddingY: 'padding',
  hexagonPaddingX: 'padding',
  hexagonPaddingY: 'padding',
  hexagonSlant: 4,
  doubleCircleGap: 5,
  doubleCirclePadding: 'padding',
  circlePadding: 'padding',
  circleMinDiameter: 0,
  subroutinePaddingX: 'padding',
  subroutinePaddingY: 'padding',
  cylinderPaddingX: 'padding',
  cylinderPaddingY: 'padding',
  leanPaddingX: 'padding',
  leanPaddingY: 'padding',
  oddPaddingX: 'padding',
  oddPaddingY: 'padding',
};

type GitGeometry = Extract<
  TokenVariable,
  | 'gitCommitRadius'
  | 'gitLaneShift'
  | 'gitBranchLabelPaddingX'
  | 'gitBranchLabelPaddingY'
  | 'gitBranchLabelRadius'
  | 'gitBranchLabelShiftX'
  | 'gitBranchLabelOffsetY'
  | 'gitArrowWidth'
  | 'gitHighlightInnerSize'
  | 'gitMergeRadius'
  | 'gitReverseCrossSize'
  | 'gitCherryPickDotRadius'
  | 'gitNodeColors'
  | 'gitPaletteColors'
>;

/**
 * gitGraph, v12 classic (`gitGraphRenderer.ts` and `styles.js` at fa796a943): bullets of
 * radius 10, the LR lanes 2 above their place, unpadded branch label boxes with corner 4,
 * 8 px arrows, highlight inner 12, merge inner 6, reverse cross 5, cherry-pick dots 2.75, and
 * the `git` palettes on the branches.
 */
export const CLASSIC_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
  gitCommitRadius: 10,
  gitLaneShift: 0,
  gitBranchLabelPaddingX: 0,
  gitBranchLabelPaddingY: 0,
  gitBranchLabelRadius: 4,
  gitBranchLabelShiftX: 0,
  gitBranchLabelOffsetY: 0,
  gitArrowWidth: 8,
  gitHighlightInnerSize: 12,
  gitMergeRadius: 6,
  gitReverseCrossSize: 5,
  gitCherryPickDotRadius: 2.75,
  gitNodeColors: false,
  gitPaletteColors: true,
};

/**
 * v12 `theme: neo` (D266): classic gitGraph geometry with the node colours on the first branch,
 * the labels and the bullet insides (v12 `NEO_COLOR_GEN_THEMES`).
 */
export const NEO_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
  ...CLASSIC_GITGRAPH,
  gitNodeColors: true,
};

/**
 * v12's redux gitGraph (`REDUX_GEOMETRY_THEMES`): bullets of radius 7, the LR lanes 7 below
 * their place (9 below classic's), branch label boxes padded 16 × 12 with square corners and,
 * in TB/BT, 11 left and 22 away from the commits, arrows at the theme's stroke width (2),
 * smaller bullet insides, and every branch in the node colours.
 */
export const REDUX_GITGRAPH: Readonly<Record<GitGeometry, number | boolean>> = {
  gitCommitRadius: 7,
  gitLaneShift: 9,
  gitBranchLabelPaddingX: 16,
  gitBranchLabelPaddingY: 12,
  gitBranchLabelRadius: 0,
  gitBranchLabelShiftX: 11,
  gitBranchLabelOffsetY: 22,
  gitArrowWidth: 2,
  gitHighlightInnerSize: 8,
  gitMergeRadius: 5,
  gitReverseCrossSize: 4,
  gitCherryPickDotRadius: 2.5,
  gitNodeColors: true,
  gitPaletteColors: false,
};

/** gitGraph's commit and tag label sizes: 10px in every v12 theme (D267). */
export const TEXT_SIZES = {
  commitLabelFontSize: 10,
  tagLabelFontSize: 10,
} as const;
