/**
 * The venn layout's px constants (spec #429 §Layout, pitfall 13): v12 `vennRenderer.ts`'s
 * lengths at the reference width, multiplied by `scale = width / referenceWidth`, and the text
 * grid's factors. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/venn-layout-literals.spec.ts`); the canvas comes from the `venn`
 * config. Venn draws SVG only (D320), so there is no cell set.
 */

/** The venn layout's fixed lengths (px at `referenceWidth`) and factors. */
export interface VennMetrics {
  /** v12 `REFERENCE_WIDTH`: the width the other lengths are given at. */
  readonly referenceWidth: number;
  /** The row a title takes above the chart: `48s`. */
  readonly titleHeight: number;
  /** The title's centre line: `y = 32s`, `dominant-baseline: middle`. */
  readonly titleBaseline: number;
  /**
   * The title's font size in px, not scaled: v12's style sheet set `.venn-title` to 32 px,
   * which beat its `32s` attribute.
   */
  readonly titleFontSize: number;
  /** Set and overlap labels: `48s`. */
  readonly labelFontSize: number;
  /** Text nodes: `40s`. */
  readonly textFontSize: number;
  /** A circle's stroke when no style sets one: `5s`. */
  readonly circleStroke: number;
  /** A label wraps to at most this many lines (D414; venn.js's `maxLines`). */
  readonly maxLabelLines: number;
  /** Steps of the halving search for the width that keeps a label to `maxLabelLines`. */
  readonly labelWidthSteps: number;
  /** The text grid's least box: `80s × 60s`. */
  readonly textBoxMinWidth: number;
  readonly textBoxMinHeight: number;
  /** The text grid box is `1.9 · innerRadius` square (v12's `innerRadius · 2 · 0.95`). */
  readonly textBoxFactor: number;
  /** With no room inside the circles, the inner radius is `0.6 · minR`. */
  readonly innerRadiusFallback: number;
  /** A labelled region's grid moves down `min(32s, innerRadius / 4)`. */
  readonly labelOffsetMax: number;
  readonly labelOffsetFactor: number;
  /** A labelled area's grid starts this far below the labels it would meet: `10s` (D750). */
  readonly labelTextGap: number;
  /** At most this many passes narrow a labelled area's grid to its inner circle (D750). */
  readonly gridPasses: number;
  /** Two text nodes or fewer move down a further `30s`. */
  readonly fewNodesOffset: number;
  readonly fewNodes: number;
  /** A text node's box is 90 % of its cell. */
  readonly cellFactor: number;
  /** `useDebugLayout`'s inner circle (`1.5s`) and cell (`1s`) strokes. */
  readonly debugCircleStroke: number;
  readonly debugCellStroke: number;
}

export const VENN_METRICS: VennMetrics = {
  referenceWidth: 1600,
  titleHeight: 48,
  titleBaseline: 32,
  titleFontSize: 32,
  labelFontSize: 48,
  textFontSize: 40,
  circleStroke: 5,
  maxLabelLines: 3,
  labelWidthSteps: 24,
  textBoxMinWidth: 80,
  textBoxMinHeight: 60,
  textBoxFactor: 1.9,
  innerRadiusFallback: 0.6,
  labelOffsetMax: 32,
  labelOffsetFactor: 0.25,
  labelTextGap: 10,
  gridPasses: 8,
  fewNodesOffset: 30,
  fewNodes: 2,
  cellFactor: 0.9,
  debugCircleStroke: 1.5,
  debugCellStroke: 1,
};

/** The CSS weight venn text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
