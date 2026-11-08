/**
 * XyChartModel: the plain-data result of an XY chart parse (spec #426 §Parser), and the input of
 * the XY chart layout (#509).
 *
 * Text is kept as written, trimmed as v12's DB trimmed it, never sanitised; `<br>` and entities
 * are resolved when labels are laid out (D385). The model holds what v12's DB held after the same
 * statements, in the same order (`xychartDb.ts`), so the order-dependent rules hold:
 *
 * - an `x-axis` with categories or a range replaces the x axis; one with only a title keeps the
 *   data and changes the title. The same for `y-axis` and its range;
 * - without x data, the first plot sets the x axis to the range `1 --> n` of its n values; later
 *   plots map onto that range (`data` below). Without a y range, the y axis spans the values of
 *   every plot read before one is given;
 * - a plot keeps the x values of the axis it saw: one written before an `x-axis` with other data
 *   keeps its `data`, and so draws at the start of a band axis (D386, `XYCHART_PLOT_BEFORE_AXIS`);
 * - against a band axis, a plot's values are cut to the category count, and a missing value is
 *   `y: undefined` (D383 draws none for it); duplicate categories are kept;
 * - a reversed range (`10 --> 0`) is kept as written.
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

export type XyChartOrientation = 'vertical' | 'horizontal';

/** A `bar` or `line` plot. */
export type XyChartPlotKind = 'bar' | 'line';

/** An x axis with categories (`x-axis [a, b]`). */
export interface XyChartBandAxis {
  readonly kind: 'band';
  readonly title: string;
  /** Trimmed, duplicates kept. */
  readonly categories: readonly string[];
}

/** A numeric axis (`min --> max`, given or inferred). */
export interface XyChartLinearAxis {
  readonly kind: 'linear';
  readonly title: string;
  readonly min: number;
  readonly max: number;
}

export type XyChartXAxis = (XyChartBandAxis | XyChartLinearAxis) & {
  /** The AST id of the last `x-axis` statement (`x-axis`, `x-axis@2`, …), when there is one. */
  readonly ast?: AstId;
};

export type XyChartYAxis = XyChartLinearAxis & {
  /** The AST id of the last `y-axis` statement, when there is one. */
  readonly ast?: AstId;
  /** Whether a `y-axis` gave the range (else it spans the plots' values). */
  readonly explicit: boolean;
};

/** One point of a plot: v12's `[x, y]` pair. */
export interface XyChartDatum {
  /** A category, or a number as text (`'1.5'`) on a linear axis. */
  readonly x: string;
  /** Absent for a category the plot has no value for. */
  readonly y?: number;
}

export interface XyChartPlot {
  /** `plot:<n>`, n from 1 in statement order. */
  readonly ast: AstId;
  readonly kind: XyChartPlotKind;
  /** Trimmed; `''` for an unnamed plot (no legend entry). */
  readonly name: string;
  /** Position among the plots, from 0: the palette slot is `index` mod the palette length. */
  readonly index: number;
  /** The values as written, before any cut. */
  readonly values: readonly number[];
  /** The points v12 computed against the x axis this plot saw. */
  readonly data: readonly XyChartDatum[];
  /** A line's point labels, trimmed, one per value (`''` for none); only when one is non-empty. */
  readonly pointLabels?: readonly string[];
}

export interface XyChartModel {
  /** The orientation of the last header that gives one; absent: `xyChart.chartOrientation`. */
  readonly orientation?: XyChartOrientation;
  /**
   * The title shown: the last in-text `title`, else the front-matter `title` (D218; v12 set the
   * front-matter one before parsing, so an in-text title wins even when it trims to `''`).
   */
  readonly title?: string;
  /** The AST id of the last in-text `title`, when there is one. */
  readonly titleAst?: AstId;
  readonly accTitle: string;
  readonly accDescr: string;
  readonly xAxis: XyChartXAxis;
  /** With no plot and no range (a rejected chart), `min` and `max` are 0. */
  readonly yAxis: XyChartYAxis;
  /** Statement order (R-ARCH-7). */
  readonly plots: readonly XyChartPlot[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}
