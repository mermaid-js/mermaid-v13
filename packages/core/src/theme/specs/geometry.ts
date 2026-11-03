/**
 * Node padding by theme family (D151, D152). Redux themes carry v12 `look: neo` values and
 * classic themes v12 classic values, which follow the diagram's `padding` config
 * (`flowchart.padding`). Circles keep v13's earlier redux values, and hexagon padding is
 * applied X to width and Y to height (v12 swaps them).
 */
import type { TokenVariable } from '../vocabulary.ts';

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
};
