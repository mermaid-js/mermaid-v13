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
import type { ArrowheadVariable, ClassMarkerVariable, TokenVariable } from '../vocabulary.ts';

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

type SequenceGeometry = Extract<
  TokenVariable,
  'actorRadius' | 'actorGlyphBand' | 'messageEndGap' | 'labelBoxExtraHeight' | 'actorFooterPadding'
>;

/**
 * Sequence geometry, v12 `look: neo` (#194): the participant box corner (`svgDraw.js`); the
 * glyph band of `actorBands.ts` (`GLYPH_BAND_HEIGHT`), which also turns on its band model;
 * the 3 px a message stops short of its target (`sequenceRenderer.ts` `buildMessageModel`);
 * the 15 px taller fragment label tab (`svgDraw.js` `drawLoop`); the 30 px added below a
 * diagram with participants (`sequenceRenderer.ts` viewBox).
 */
export const NEO_SEQUENCE: Readonly<Record<SequenceGeometry, number>> = {
  actorRadius: 6,
  actorGlyphBand: 44,
  messageEndGap: 3,
  labelBoxExtraHeight: 15,
  actorFooterPadding: 30,
};

/** v12 classic: corner 3, no glyph band (per-shape symbols), and none of the neo extras. */
export const CLASSIC_SEQUENCE: Readonly<Record<SequenceGeometry, number>> = {
  actorRadius: 3,
  actorGlyphBand: 0,
  messageEndGap: 0,
  labelBoxExtraHeight: 0,
  actorFooterPadding: 0,
};

type TimelineGeometry = Extract<
  TokenVariable,
  'timelineRadius' | 'timelineLabelOffset' | 'timelineEventLabelShift' | 'timelineScaleColors'
>;

/**
 * Timeline boxes in the redux themes (v12 `svgDraw.js` and `styles.js` for a theme name with
 * `redux`): square corners, labels `padding` below the top (events `padding / 2 + 3`), and the
 * `mainBkg` / `nodeBorder` paint with the border palette and the theme's shadow.
 */
export const REDUX_TIMELINE: Readonly<Record<TimelineGeometry, number | string | boolean>> = {
  timelineRadius: 0,
  timelineLabelOffset: 'padding',
  timelineEventLabelShift: 3,
  timelineScaleColors: false,
};

/**
 * v12 classic, also the neo themes' (D227: v12 `theme: neo` drew classic timeline geometry):
 * top corners 5, labels `padding / 2` below the top, `cScale` fills with a `cScaleInv` rule.
 */
export const CLASSIC_TIMELINE: Readonly<Record<TimelineGeometry, number | string | boolean>> = {
  timelineRadius: 5,
  timelineLabelOffset: '0.5 * padding',
  timelineEventLabelShift: 0,
  timelineScaleColors: true,
};

/**
 * Class relationship markers, v12 neo (`*-margin` markers in rendering-elements/markers.js at
 * fa796a943), each measured from the node outline after `markerOffsets` shortens the line
 * (17.25 for the diamonds and the triangle, 6 for dependency, 13.5 for the lollipop).
 * Extension: polygon 10→18 with refX 9, so 8 long and its tip 17.25 − 9 = 8.25 short of the
 * outline. Composition: the diamond with refX 3.5, tip 17.25 − 14.5 = 2.75 short. Dependency:
 * refX 16, tip 6 − 2 = 4 short. Hollow markers have a 2px outline, filled ones none.
 */
export const NEO_CLASS_MARKERS: Readonly<Record<ClassMarkerVariable, number>> = {
  classMarkerStrokeWidth: 2,
  classFilledMarkerStrokeWidth: 0,
  extensionMarkerLength: 8,
  extensionMarkerGap: 8.25,
  compositionMarkerGap: 2.75,
  dependencyMarkerGap: 4,
};

/**
 * v12 classic: every class marker has refX 1 (dependency 13) and a 1px outline (`styles.js`
 * `.extension { stroke-width: 1 }` and so on). The diamonds and the triangle are 17 long with
 * their tip 17.25 − 17 = 0.25 short of the outline; dependency's tip is 6 − 5 = 1 short.
 */
export const CLASSIC_CLASS_MARKERS: Readonly<Record<ClassMarkerVariable, number>> = {
  classMarkerStrokeWidth: 1,
  classFilledMarkerStrokeWidth: 1,
  extensionMarkerLength: 17,
  extensionMarkerGap: 0.25,
  compositionMarkerGap: 0.25,
  dependencyMarkerGap: 1,
};

/**
 * Sizes every theme shares: v12 drew class multiplicities at 11px (`.edgeTerminals`), and every
 * v12 theme sets the same pie text sizes, stroke widths and slice opacity (`theme-*.js`, #325).
 */
export const TEXT_SIZES = {
  classTerminalFontSize: 11,
  pieTitleTextSize: 25,
  pieSectionTextSize: 17,
  pieLegendTextSize: 17,
  pieStrokeWidth: 2,
  pieOuterStrokeWidth: 2,
  pieOpacity: 0.7,
  commitLabelFontSize: 10,
  tagLabelFontSize: 10,
} as const;
