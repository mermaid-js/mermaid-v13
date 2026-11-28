/**
 * The radar layout's px constants (spec #422 §Layout, pitfall 13): v12 `renderer.ts`'s fixed
 * lengths and thresholds. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/radar-layout-literals.spec.ts`); every other length comes from the
 * `radar` config or a theme variable. Radar draws SVG only (D320), so there is no cell set.
 */

/** The radar layout's fixed lengths and factors. */
export interface RadarMetrics {
  /** v12 `labelPad`: an axis label sits this far past `radius * axisLabelFactor` (`:122`). */
  readonly labelPad: number;
  /** v12's `cos`/`sin` dead band for a label's anchor and baseline (`:116-117`). */
  readonly anchorThreshold: number;
  /** v12 `lineHeight`: one legend row (`:222`). */
  readonly legendRow: number;
  /**
   * The gap from the swatch's right edge to the legend text: v12 put the text 16 px right of
   * its row's origin with a 12 px swatch (`:235`); the swatch is `radarLegendBoxSize` (D359).
   */
  readonly legendTextGap: number;
  /** The legend sits `¾` of the way from the centre to the canvas corner (`:220-221`). */
  readonly legendFactor: number;
  /**
   * When a legend row meets an axis label, the legend moves right to this far past the label's
   * right edge (D614, #846); v12 had no such rule.
   */
  readonly legendLabelGap: number;
  /**
   * When the title meets an axis label (#1257: a top label of several lines grows up into
   * it), the title moves up to this far above the label's top (D739); v12 had no such rule.
   */
  readonly titleLabelGap: number;
}

export const RADAR_METRICS: RadarMetrics = {
  labelPad: 4,
  anchorThreshold: 0.01,
  legendRow: 20,
  legendTextGap: 4,
  legendFactor: 3 / 4,
  legendLabelGap: 4,
  titleLabelGap: 4,
};

/** v12 writes `radarCurve-0`…`radarCurve-11`: a curve takes slot `index mod 12` (D353). */
export const RADAR_SLOTS = 12;

/** The CSS weight radar text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
