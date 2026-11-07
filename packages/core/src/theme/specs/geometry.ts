/**
 * Geometry the two theme families share (D151, D152). The redux themes carry v12 `look: neo`
 * geometry, the classic themes v12 classic geometry.
 *
 * Arrowheads come from v12 12.2.0 `markers.js` and `lineWithOffset.ts`. Sizes are in px; a gap
 * is the space between the node outline and the nearest point of the arrowhead.
 *
 * Node padding in the classic themes follows the diagram's `padding` config
 * (`flowchart.padding`). Circles keep v13's earlier redux values, and hexagon padding is
 * applied X to width and Y to height (v12 swaps them); the rounded rectangle takes `padding`
 * per side in every theme, so it has no variable. Only what flowchart shares with state
 * (the point arrowhead) and mindmap (rectangle, hexagon and circle padding) is here; flowchart's
 * other arrowheads and shapes are in its own theme table (spec #414 T4).
 */
import type { ArrowheadVariable, TokenVariable } from '../vocabulary.ts';

/**
 * v12 neo (`*-margin` markers). Point: viewBox 11.5×14 met into 10.5×14, so 10.5 long and
 * 14×10.5/11.5 ≈ 12.78 wide, tip at the line end, which `markerOffsets.arrow_point` puts 4
 * before the outline.
 */
export const NEO_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 4,
  arrowheadLength: 10.5,
  arrowheadWidth: 12.78,
};

/**
 * v12 classic. Point: viewBox 10 into 8×8, refX 5, so the tip lands on the outline after the
 * line's 4px shortening.
 */
export const CLASSIC_ARROWHEADS: Readonly<Record<ArrowheadVariable, number>> = {
  arrowheadGap: 0,
  arrowheadLength: 8,
  arrowheadWidth: 8,
};

type PaddingToken = Extract<
  TokenVariable,
  | 'nodePaddingX'
  | 'nodePaddingY'
  | 'hexagonPaddingX'
  | 'hexagonPaddingY'
  | 'hexagonSlant'
  | 'circlePadding'
>;

export const REDUX_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: 16,
  nodePaddingY: 12,
  hexagonPaddingX: 70,
  hexagonPaddingY: 32,
  hexagonSlant: 3.5,
  circlePadding: 16,
};

export const CLASSIC_PADDING: Readonly<Record<PaddingToken, number | string>> = {
  nodePaddingX: '2 * padding',
  nodePaddingY: 'padding',
  hexagonPaddingX: 'padding',
  hexagonPaddingY: 'padding',
  hexagonSlant: 4,
  circlePadding: 'padding',
};
