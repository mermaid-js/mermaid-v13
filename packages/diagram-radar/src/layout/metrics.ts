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
  /** The legend text's left edge, right of its row's origin (`:235`). */
  readonly legendTextX: number;
  /** The legend sits `¾` of the way from the centre to the canvas corner (`:220-221`). */
  readonly legendFactor: number;
}

export const RADAR_METRICS: RadarMetrics = {
  labelPad: 4,
  anchorThreshold: 0.01,
  legendRow: 20,
  legendTextX: 16,
  legendFactor: 3 / 4,
};

/** v12 `db.ts` `MAX_TICKS`: more rings are clamped (`RADAR_TICKS_CLAMPED`, D356). */
export { MAX_TICKS } from '../model.ts';

/** v12 writes `radarCurve-0`…`radarCurve-11`: a curve takes slot `index mod 12` (D353). */
export const RADAR_SLOTS = 12;

/** The CSS weight radar text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
