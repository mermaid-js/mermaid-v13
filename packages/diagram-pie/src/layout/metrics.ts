/**
 * The pie layout's lengths (spec #288 §Layout, pitfall 13): v12 `pieRenderer.ts`'s constants in
 * px, and every length derived from them. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/pie-layout-literals.spec.ts`). Pie draws SVG only (D216), so there
 * is no cell set.
 */

/** v12's fixed canvas and legend constants (`pieRenderer.ts` :38-42, :157-251). */
const HEIGHT = 450;
const MARGIN = 40;
const LEGEND_RECT_SIZE = 18;
const LEGEND_SPACING = 4;
/** v12 draws the title `50` px short of half the height above the centre (:143-148). */
const TITLE_GAP = 50;
/** The right-hand legend sits `12` swatches right of the centre (:240-247). */
const RIGHT_LEGEND_SWATCHES = 12;
/** D222: a highlighted slice is drawn `scale(1.05)` about the centre. */
const HIGHLIGHT_SCALE = 1.05;

/** The pie layout's lengths, in px. */
export interface PieMetrics {
  /** The canvas v12 started from: 450 × 450. */
  readonly height: number;
  readonly width: number;
  /** v12 `MARGIN`: the gap from the pie to the canvas edge, also added once to v12's width. */
  readonly margin: number;
  /** `min(width, height) / 2 - margin`: 185. */
  readonly radius: number;
  /** The legend swatch side. */
  readonly swatch: number;
  /** One legend row, swatch plus spacing: 22. */
  readonly row: number;
  /** From the row's left edge to its text's left edge: 22. */
  readonly legendTextX: number;
  /** From the row's top to its text's first baseline: 14. */
  readonly legendTextY: number;
  /** The right-hand legend's left edge, right of the centre: `12 * 18`. */
  readonly rightLegendX: number;
  /** The title's first baseline, above the canvas centre: `(450 - 50) / 2`. */
  readonly titleY: number;
  /** The highlighted slice's scale about the centre (D222). */
  readonly highlightScale: number;
}

export const PIE_METRICS: PieMetrics = {
  height: HEIGHT,
  width: HEIGHT,
  margin: MARGIN,
  radius: HEIGHT / 2 - MARGIN,
  swatch: LEGEND_RECT_SIZE,
  row: LEGEND_RECT_SIZE + LEGEND_SPACING,
  legendTextX: LEGEND_RECT_SIZE + LEGEND_SPACING,
  legendTextY: LEGEND_RECT_SIZE - LEGEND_SPACING,
  rightLegendX: RIGHT_LEGEND_SWATCHES * LEGEND_RECT_SIZE,
  titleY: (HEIGHT - TITLE_GAP) / 2,
  highlightScale: HIGHLIGHT_SCALE,
};

/** The CSS weight pie text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;

/** v12's `pie` config defaults and bounds (`config.schema.yaml`): ratios, not lengths. */
export const PIE_OPTIONS = {
  /** `textPosition`: the percentages at 0.75 of the radius. */
  textPosition: 0.75,
  /** `donutHole` counts only in (0, 0.9]. */
  maxDonutHole: 0.9,
} as const;

/** v12's twelve colours, `pie1`…`pie12`: a section takes slot `index mod 12`. */
export const PIE_COLOURS = 12;
/** A percentage is out of 100. */
export const PERCENT = 100;
/** Slices under 1% of the sum are not drawn (D223). */
export const MIN_PERCENT = 1;
