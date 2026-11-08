/**
 * The XY chart layout's px constants and factors (spec #426 §Package, pitfall 13): v12's fixed
 * lengths and ratios, each with its v12 line (`fa796a943:packages/mermaid/src/diagrams/xychart/`).
 * No other file in `layout/` writes a length literal
 * (`packages/conformance/src/xychart-layout-literals.spec.ts`); every other length comes from the
 * `xyChart` config or the measurer. XY charts draw SVG only (D320), so there is no cell set.
 */

/** The XY chart layout's fixed lengths and factors. */
export interface XyChartMetrics {
  /** A bar is this much narrower than its slot (`plot/barPlot.ts:20`, `barPaddingPercent`). */
  readonly barPadding: number;
  /** Outer padding is at most this share of the space the axis is given (`axis/baseAxis.ts:13`). */
  readonly maxOuterPadding: number;
  /** With a bar plot, outer padding grows to this share of the tick distance, halved (`:12`). */
  readonly barToTick: number;
  /** Legend marker, item spacing and marker spacing, per px of `legendFontSize` (`legend.ts:18-20`). */
  readonly legendMarker: number;
  readonly legendItemSpacing: number;
  readonly legendMarkerSpacing: number;
  /** Line point labels: font size and distance from the point (`plot/linePlot.ts:49-50`). */
  readonly pointLabelFontSize: number;
  readonly pointLabelOffset: number;
  /** A line's stroke width (`xychartDb.ts:184`). */
  readonly lineStrokeWidth: number;
  /** v12's character-width approximation for data labels (`xychartRenderer.ts:107`, `:173`). */
  readonly dataLabelCharWidth: number;
  /** Data label margin from the bar end (`xychartRenderer.ts:109`, `:161`). */
  readonly dataLabelMargin: number;
  /** A horizontal bar's data label starts at this share of the bar's height (`:127`). */
  readonly dataLabelStart: number;
  /** Data label font sizes are tried from the start down in steps of this (`:131`, `:197`). */
  readonly dataLabelStep: number;
  /** d3 `scale.ticks()`'s default count (`axis/linearAxis.ts:24`). */
  readonly tickCount: number;
  /**
   * Values and ranges past this magnitude are drawn at it, so a 309-digit value (Infinity) or a
   * range that overflows a double never reaches the scales (D383: never NaN or Infinity).
   */
  readonly valueLimit: number;
}

export const XYCHART_METRICS: XyChartMetrics = {
  barPadding: 0.05,
  maxOuterPadding: 0.2,
  barToTick: 0.7,
  legendMarker: 0.75,
  legendItemSpacing: 0.5,
  legendMarkerSpacing: 0.35,
  pointLabelFontSize: 12,
  pointLabelOffset: 10,
  lineStrokeWidth: 2,
  dataLabelCharWidth: 0.7,
  dataLabelMargin: 10,
  dataLabelStart: 0.7,
  dataLabelStep: 1,
  tickCount: 10,
  valueLimit: 1e300,
};

/** The CSS weight XY chart text is measured and drawn at: v12 sets none, so normal. */
export const NORMAL_WEIGHT = 400;
