/**
 * XyChartLayout: the plain-data result of the XY chart custom layout (`layoutKind: 'custom'`,
 * spec #426 §Layout). Every length is in px (XY charts draw SVG only, D320), in the canvas's
 * coordinates (`0 0 width height`, v12's viewBox), with nothing left for the renderer to compute
 * but SVG syntax. Rectangles have their top-left corner at `x`, `y`.
 *
 * Text is placed as v12 placed it: an anchor point, `text-anchor`, a baseline and a rotation
 * (degrees, about the anchor). `box` is the text's box about the anchor before the rotation,
 * from the measurer, so the bounds and the invariants see what is drawn.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { XyChartOrientation, XyChartPlotKind } from '../model.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export type { Rect };

/** A straight stroke from `(x1, y1)` to `(x2, y2)`. */
export interface Segment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type XyTextAnchor = 'start' | 'middle' | 'end';
/**
 * Where the anchor is on the text: its top (v12 `text-before-edge`), its hanging baseline (v12
 * `hanging`, a data label inside a vertical bar; placed as `top`), its middle, or its alphabetic
 * baseline (v12 `auto`, a data label outside its bar).
 */
export type XyBaseline = 'top' | 'hanging' | 'middle' | 'alphabetic';

export interface XyText extends Point {
  /** The text as written: a tick number, a category, a title, a name, a value. */
  readonly text: string;
  readonly anchor: XyTextAnchor;
  readonly baseline: XyBaseline;
  /** Degrees clockwise about `(x, y)`. */
  readonly rotation: number;
  readonly font: FontKey;
  /** The text's box before the rotation. */
  readonly box: Rect;
  /**
   * Core label layout's lines (D385): the title, axis titles, categories, legend names and point
   * labels, so `<br>`, math and icons work. Absent for plain text (tick numbers, data labels).
   */
  readonly label?: MeasuredLabel;
}

export type XyAxisPosition = 'bottom' | 'left' | 'top';

/** One tick of an axis: its place along the axis, its stroke and its label, each when shown. */
export interface XyTick {
  /** The tick's value: a category, or a number. */
  readonly value: string | number;
  /** Its coordinate along the axis (x for a bottom or top axis, y for a left one). */
  readonly at: number;
  readonly line?: Segment;
  readonly label?: XyText;
}

/** An axis (v12 `BaseAxis`): what it was given, where its scale runs, and its drawn parts. */
export interface XyAxisLayout {
  readonly kind: 'band' | 'linear';
  readonly position: XyAxisPosition;
  /** The AST id of the `x-axis`/`y-axis` statement, when there is one. */
  readonly ast?: AstId;
  /** v12's `boundingRect`: the strip beside the plot the axis was given. */
  readonly box: Rect;
  /** The scale's range: the plot's side less `outerPadding` at each end. */
  readonly range: readonly [number, number];
  readonly outerPadding: number;
  /** A linear axis's domain as the scale reads it (reversed on a left axis, as v12's). */
  readonly domain?: readonly [number, number];
  /** A band axis's categories, duplicates kept. */
  readonly categories?: readonly string[];
  /** In v12's order (a left linear axis counts down). */
  readonly ticks: readonly XyTick[];
  readonly tickWidth: number;
  readonly line?: Segment;
  readonly lineWidth: number;
  readonly title?: XyText;
}

/** One drawn bar: data point `datum` of its plot. */
export interface XyBar extends Rect {
  readonly datum: number;
  /** The value, drawn from the axis towards it and held inside the plot box. */
  readonly value: number;
}

export interface XyBarPlotLayout {
  readonly kind: 'bar';
  /** The plot's index in `XyChartModel.plots`: v12's `bar-plot-<index>` and palette slot. */
  readonly index: number;
  readonly ast: AstId;
  /** One per data point with a value, in data order. */
  readonly bars: readonly XyBar[];
  /**
   * `showDataLabel`: one label per bar with room for it, each the plot's own value (D382), all
   * at one font size, the smallest that fits them (D611); none when no bar has room
   * (`XYCHART_LABEL_TOO_SMALL`).
   */
  readonly dataLabels: readonly XyText[];
}

/** One point of a line: data point `datum` of its plot. */
export interface XyLinePoint extends Point {
  readonly datum: number;
}

export interface XyLinePlotLayout {
  readonly kind: 'line';
  readonly index: number;
  readonly ast: AstId;
  /** The points with a value, in data order. */
  readonly points: readonly XyLinePoint[];
  /** d3 `line()`'s path through them; a missing value starts a new run (D383). */
  readonly path: string;
  readonly strokeWidth: number;
  /** v12's point labels: 12 px, 10 px from the point, each non-empty one. */
  readonly pointLabels: readonly XyText[];
}

export type XyPlotLayout = XyBarPlotLayout | XyLinePlotLayout;

/** One legend row: a named plot. */
export interface XyLegendRow {
  readonly index: number;
  readonly ast: AstId;
  readonly kind: XyChartPlotKind;
  /** A bar plot's square marker. */
  readonly swatch?: Rect;
  /** A line plot's marker: a stroke `legendMarker` long… */
  readonly stroke?: Segment;
  /** …the line's width. */
  readonly strokeWidth?: number;
  readonly label: XyText;
}

export interface XyLegendLayout {
  /** The legend's box, right of the plot, centred on its height. */
  readonly box: Rect;
  readonly rows: readonly XyLegendRow[];
}

export interface XyChartLayout {
  readonly orientation: XyChartOrientation;
  /** `xyChart.useMaxWidth`: the chart scales to its container (D387). */
  readonly useMaxWidth: boolean;
  /** v12's canvas: `xyChart.width` × `xyChart.height`. */
  readonly width: number;
  readonly height: number;
  /** The plot area. */
  readonly plot: Rect;
  /** The data axis: bottom when vertical, left when horizontal. */
  readonly xAxis: XyAxisLayout;
  /** The value axis: left when vertical, top when horizontal. */
  readonly yAxis: XyAxisLayout;
  /** In `XyChartModel.plots` order. */
  readonly plots: readonly XyPlotLayout[];
  /** Absent when no plot is named, `showLegend` is off, or it does not fit. */
  readonly legend?: XyLegendLayout;
  /** Absent without a title, with `showTitle` off, or when it does not fit. */
  readonly title?: XyText;
  /** The canvas, grown to cover everything drawn (D224). */
  readonly bounds: Rect;
}
