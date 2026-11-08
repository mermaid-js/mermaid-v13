/**
 * The XY chart custom layout (spec #426 T3, `layoutKind: 'custom'`): `XyChartModel` in,
 * `XyChartLayout` out. It is v12's chart builder (`chartBuilder/orchestrator.ts` and its
 * components) without d3 or the DOM: every text is measured first through the injected measurer
 * (core label layout for what the author writes, D385), then space is handed out in v12's order:
 * the plot's reserved share, the title, the x axis, the y axis, the legend, and the rest to the
 * plot. Bars, lines, point labels and data labels follow v12's components and renderer. Lengths
 * come from the `xyChart` config, the measurer and the metrics table (pitfall 13).
 *
 * Fixed on the way (D382, D383): each bar plot's data labels are its own values, not plot 0's;
 * a missing value draws no bar, point or label (`XYCHART_MISSING_VALUE`); an empty range maps
 * every value to the axis middle (`XYCHART_EMPTY_RANGE`); data labels with no room are left out
 * (`XYCHART_LABEL_TOO_SMALL`); a bar is held inside the plot box (v12 drew one past the axis
 * with a negative size, or out of the plot); legend markers get no data labels (v12 labelled
 * every `rect`, `xychartRenderer.ts:102`). One warning per
 * kind per layout.
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import { xyChartOptions, type XyChartOptions } from '../config.ts';
import type { XyChartModel, XyChartPlot } from '../model.ts';
import { Axis, type AxisData } from './axis.ts';
import { NORMAL_WEIGHT, XYCHART_METRICS } from './metrics.ts';
import { linePath } from './scale.ts';
import { place, textBounds, textKit, type Measured, type TextKit } from './text.ts';
import type {
  Point,
  Rect,
  Segment,
  XyBar,
  XyBarPlotLayout,
  XyChartLayout,
  XyLegendLayout,
  XyLegendRow,
  XyLinePlotLayout,
  XyLinePoint,
  XyText,
} from './types.ts';

/** What the layout reads from the render context. */
export type XyChartLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

export const XYCHART_MISSING_VALUE = 'XYCHART_MISSING_VALUE';
export const XYCHART_EMPTY_RANGE = 'XYCHART_EMPTY_RANGE';
export const XYCHART_LABEL_TOO_SMALL = 'XYCHART_LABEL_TOO_SMALL';

const M = XYCHART_METRICS;

/** For a layout run without a `warn` sink (unit tests, the invariants). */
const ignoreWarning = (): void => undefined;

/** `v` held to ±`valueLimit` (a 309-digit value is Infinity). */
const held = (v: number): number => Math.min(Math.max(v, -M.valueLimit), M.valueLimit);

/** Lays out an XY chart in px. */
export function layoutXyChart(model: XyChartModel, ctx: XyChartLayoutContext): XyChartLayout {
  const options = xyChartOptions(ctx.config.xyChart as Readonly<Record<string, unknown>>);
  const warn = once(ctx.warn ?? ignoreWarning);
  const family = ctx.theme.value('fontFamily');
  const kit = textKit(ctx.measurer, ctx.inline);
  const orientation = model.orientation ?? options.chartOrientation;
  const horizontal = orientation === 'horizontal';

  // The axes' data: v12's DB values, ranges held finite (D383).
  const x = model.xAxis;
  const xData: AxisData =
    x.kind === 'band'
      ? { kind: 'band', categories: x.categories }
      : { kind: 'linear', domain: [held(x.min), held(x.max)] };
  const yData: AxisData = {
    kind: 'linear',
    domain: [held(model.yAxis.min), held(model.yAxis.max)],
  };
  const emptyAxes = [
    ...(xData.kind === 'linear' && xData.domain[0] === xData.domain[1] ? [x.ast] : []),
    ...(yData.domain[0] === yData.domain[1] ? [model.yAxis.ast] : []),
  ];
  if (emptyAxes.length > 0)
    warn(
      XYCHART_EMPTY_RANGE,
      'An axis range is empty (min = max): its values are drawn at the axis middle',
      emptyAxes
    );

  // Measure first: the title, both axes' labels and titles (in the axes), the legend names.
  const font = (size: number): FontKey => ({ family, size, weight: NORMAL_WEIGHT });
  const titleFont = font(options.titleFontSize);
  const titleText = model.title ? kit.label(model.title, titleFont) : undefined;
  const xAxis = new Axis({
    data: xData,
    title: x.title,
    ...(x.ast === undefined ? {} : { ast: x.ast }),
    options: options.xAxis,
    family,
    weight: NORMAL_WEIGHT,
    kit,
  });
  const yAxis = new Axis({
    data: yData,
    title: model.yAxis.title,
    ...(model.yAxis.ast === undefined ? {} : { ast: model.yAxis.ast }),
    options: options.yAxis,
    family,
    weight: NORMAL_WEIGHT,
    kit,
  });
  const legend = new Legend(model, options, font(options.legendFontSize), kit);
  const title = new Title(titleText, options);

  const frame = horizontal
    ? horizontalSpace(options, title, xAxis, yAxis, legend)
    : verticalSpace(options, title, xAxis, yAxis, legend);
  if (model.plots.some((p) => p.kind === 'bar')) xAxis.padForBars();

  const missing = new Set<AstId>();
  const plots = model.plots.map((plot) =>
    plot.kind === 'bar'
      ? barPlot(plot, frame.plot, xAxis, yAxis, horizontal, missing)
      : linePlot(plot, xAxis, yAxis, horizontal, { font: font(M.pointLabelFontSize), kit }, missing)
  );
  if (missing.size > 0)
    warn(
      XYCHART_MISSING_VALUE,
      'A plot has fewer values than categories: those points are not drawn',
      [...missing]
    );
  const labelled = options.showDataLabel
    ? plots.map((p) => (p.kind === 'bar' ? withDataLabels(p, options, horizontal, family, kit) : p))
    : plots;
  const tooSmall = labelled.filter(
    (p) => p.kind === 'bar' && p.dataLabels.length === 0 && p.bars.length > 0
  );
  if (options.showDataLabel && tooSmall.length > 0)
    warn(
      XYCHART_LABEL_TOO_SMALL,
      'No bar has room for a data label: none are drawn',
      tooSmall.map((p) => p.ast)
    );

  const layout = {
    orientation,
    width: options.width,
    height: options.height,
    plot: frame.plot,
    xAxis: xAxis.result(),
    yAxis: yAxis.result(),
    plots: labelled,
    ...(legend.result() ?? {}),
    ...(title.result() ?? {}),
  };
  return { ...layout, bounds: boundsOf(layout) };
}

/** A `warn` that passes on the first warning of each code only (D383: one per kind). */
function once(
  sink: (w: Warning) => void
): (code: string, message: string, astIds: readonly (AstId | undefined)[]) => void {
  const seen = new Set<string>();
  return (code, message, astIds) => {
    if (seen.has(code)) return;
    seen.add(code);
    const ids = astIds.filter((id): id is AstId => id !== undefined);
    sink({ code, message, ...(ids.length > 0 ? { astIds: ids } : {}) });
  };
}

/** v12 `ChartTitle`: a row above everything when it fits, centred over the plot. */
class Title {
  private shown = false;
  private readonly box = { x: 0, y: 0, width: 0, height: 0 };
  private titleWidth = 0;
  constructor(
    private readonly text: Measured | undefined,
    private readonly options: XyChartOptions
  ) {}

  calculateSpace(available: { width: number; height: number }): { width: number; height: number } {
    const t = this.text;
    if (t) {
      const width = Math.max(t.width, available.width);
      const height = t.height + 2 * this.options.titlePadding;
      if (height <= available.height && this.options.showTitle) {
        this.box.width = width;
        this.box.height = height;
        this.titleWidth = t.width;
        this.shown = true;
      }
    }
    return { width: this.box.width, height: this.box.height };
  }

  /** Centred over `[start, end]`, shifted to stay inside the canvas (`chartTitle.ts:64-72`). */
  alignTo(start: number, end: number): void {
    const half = Math.min(this.titleWidth, this.options.width) / 2;
    const center = Math.min(Math.max((start + end) / 2, half), this.options.width - half);
    this.box.x = center - half;
    this.box.width = half * 2;
  }

  result(): { title: XyText } | undefined {
    if (!this.shown || !this.text) return undefined;
    const at = { x: this.box.x + this.box.width / 2, y: this.box.y + this.box.height / 2 };
    return { title: place(this.text, at, 'middle', 'middle') };
  }
}

/** v12 `ChartLegend`: the named plots, right of the plot, dropped whole when it does not fit. */
class Legend {
  private rows: { plot: XyChartPlot; text: Measured }[] = [];
  private readonly box = { x: 0, y: 0, width: 0, height: 0 };
  private readonly marker: number;
  private readonly markerSpacing: number;
  private readonly itemSpacing: number;
  private readonly named: { plot: XyChartPlot; text: Measured }[];
  constructor(
    model: XyChartModel,
    private readonly options: XyChartOptions,
    private readonly font: FontKey,
    private readonly kit: TextKit
  ) {
    const size = options.legendFontSize;
    this.marker = size * M.legendMarker;
    this.markerSpacing = size * M.legendMarkerSpacing;
    this.itemSpacing = size * M.legendItemSpacing;
    this.named = options.showLegend
      ? model.plots
          .filter((p) => p.name)
          .map((plot) => ({ plot, text: kit.label(plot.name, font) }))
      : [];
  }

  calculateSpace(available: { width: number; height: number }): { width: number; height: number } {
    const n = this.named.length;
    if (n === 0) return { width: 0, height: 0 };
    const text = this.kit.max(
      this.named.map((r) => r.text),
      this.font
    );
    const pad = this.options.legendPadding;
    const width = pad * 2 + this.marker + this.markerSpacing + text.width;
    const height = pad * 2 + n * this.options.legendFontSize + (n - 1) * this.itemSpacing;
    if (width <= available.width && height <= available.height) {
      this.box.width = width;
      this.box.height = height;
      this.rows = this.named;
    }
    return { width: this.box.width, height: this.box.height };
  }

  setOrigin(x: number, y: number): void {
    this.box.x = x;
    this.box.y = y;
  }

  result(): { legend: XyLegendLayout } | undefined {
    if (this.rows.length === 0) return undefined;
    const pad = this.options.legendPadding;
    const row = this.options.legendFontSize + this.itemSpacing;
    const x = this.box.x + pad;
    const y0 = this.box.y + pad;
    const rows = this.rows.map(({ plot, text }, i): XyLegendRow => {
      const y = y0 + i * row;
      const mid = y + this.marker / 2;
      const label = place(
        text,
        { x: x + this.marker + this.markerSpacing, y: mid },
        'start',
        'middle'
      );
      const marker =
        plot.kind === 'bar'
          ? { swatch: { x, y, width: this.marker, height: this.marker } }
          : { stroke: { x1: x, y1: mid, x2: x + this.marker, y2: mid } };
      return { index: plot.index, ast: plot.ast, kind: plot.kind, ...marker, label };
    });
    return { legend: { box: { ...this.box }, rows } };
  }
}

interface Frame {
  readonly plot: Rect;
}

/** v12 `calculateVerticalSpace` (`orchestrator.ts:61-128`): x axis bottom, y axis left. */
function verticalSpace(
  options: XyChartOptions,
  title: Title,
  xAxis: Axis,
  yAxis: Axis,
  legend: Legend
): Frame {
  let width = options.width;
  let height = options.height;
  let plotWidth = Math.floor((width * options.plotReservedSpacePercent) / 100);
  let plotHeight = Math.floor((height * options.plotReservedSpacePercent) / 100);
  width -= plotWidth;
  height -= plotHeight;
  const plotY = title.calculateSpace({ width: options.width, height }).height;
  height -= plotY;
  xAxis.setPosition('bottom');
  height -= xAxis.calculateSpace({ width, height }).height;
  yAxis.setPosition('left');
  const plotX = yAxis.calculateSpace({ width, height }).width;
  width -= plotX;
  const legendSpace = legend.calculateSpace({ width, height: plotHeight });
  width -= legendSpace.width;
  if (width > 0) plotWidth += width;
  if (height > 0) plotHeight += height;
  title.alignTo(plotX, plotX + plotWidth);
  legend.setOrigin(plotX + plotWidth, plotY + Math.max((plotHeight - legendSpace.height) / 2, 0));
  xAxis.setRange([plotX, plotX + plotWidth]);
  xAxis.setOrigin(plotX, plotY + plotHeight);
  yAxis.setRange([plotY, plotY + plotHeight]);
  yAxis.setOrigin(0, plotY);
  return { plot: { x: plotX, y: plotY, width: plotWidth, height: plotHeight } };
}

/** v12 `calculateHorizontalSpace` (`orchestrator.ts:130-199`): x axis left, y axis top. */
function horizontalSpace(
  options: XyChartOptions,
  title: Title,
  xAxis: Axis,
  yAxis: Axis,
  legend: Legend
): Frame {
  let width = options.width;
  let height = options.height;
  let plotWidth = Math.floor((width * options.plotReservedSpacePercent) / 100);
  let plotHeight = Math.floor((height * options.plotReservedSpacePercent) / 100);
  width -= plotWidth;
  height -= plotHeight;
  const titleEnd = title.calculateSpace({ width: options.width, height }).height;
  height -= titleEnd;
  xAxis.setPosition('left');
  const plotX = xAxis.calculateSpace({ width, height }).width;
  width -= plotX;
  yAxis.setPosition('top');
  const yHeight = yAxis.calculateSpace({ width, height }).height;
  height -= yHeight;
  const plotY = titleEnd + yHeight;
  const legendSpace = legend.calculateSpace({ width, height: plotHeight });
  width -= legendSpace.width;
  if (width > 0) plotWidth += width;
  if (height > 0) plotHeight += height;
  title.alignTo(plotX, plotX + plotWidth);
  legend.setOrigin(plotX + plotWidth, plotY + Math.max((plotHeight - legendSpace.height) / 2, 0));
  yAxis.setRange([plotX, plotX + plotWidth]);
  yAxis.setOrigin(plotX, titleEnd);
  xAxis.setRange([plotY, plotY + plotHeight]);
  xAxis.setOrigin(0, plotY);
  return { plot: { x: plotX, y: plotY, width: plotWidth, height: plotHeight } };
}

/** `v` held inside `[a, b]` either way round. */
const within = (v: number, a: number, b: number): number =>
  Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

/**
 * v12 `BarPlot` (`plot/barPlot.ts`): bars `0.95 · min(2 · outerPadding, tickDistance)` wide,
 * from the plot's bottom (vertical) or left edge (horizontal) to the value. A bar is held inside
 * the plot box: its value end at the box's edge, and its sides cut there (a plot written before
 * its `x-axis` can sit past a linear range, D386). A missing value draws no bar.
 */
function barPlot(
  plot: XyChartPlot,
  box: Rect,
  xAxis: Axis,
  yAxis: Axis,
  horizontal: boolean,
  missing: Set<AstId>
): XyBarPlotLayout {
  const size = Math.min(xAxis.getOuterPadding() * 2, xAxis.tickDistance()) * (1 - M.barPadding);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const bars: XyBar[] = [];
  plot.data.forEach((d, datum) => {
    if (d.y === undefined) {
      missing.add(plot.ast);
      return;
    }
    const value = held(d.y);
    const at = xAxis.scale(d.x);
    const lo = at - size / 2;
    if (horizontal) {
      const end = within(yAxis.scale(value), box.x, right);
      const y = within(lo, box.y, bottom);
      const height = within(lo + size, box.y, bottom) - y;
      bars.push({ datum, value, x: box.x, y, width: end - box.x, height });
    } else {
      const end = within(yAxis.scale(value), box.y, bottom);
      const x = within(lo, box.x, right);
      const width = within(lo + size, box.x, right) - x;
      bars.push({ datum, value, x, y: end, width, height: bottom - end });
    }
  });
  return { kind: 'bar', index: plot.index, ast: plot.ast, bars, dataLabels: [] };
}

/** v12 `LinePlot` (`plot/linePlot.ts`): d3 `line()` through the points, and the point labels. */
function linePlot(
  plot: XyChartPlot,
  xAxis: Axis,
  yAxis: Axis,
  horizontal: boolean,
  labels: { readonly font: FontKey; readonly kit: TextKit },
  missing: Set<AstId>
): XyLinePlotLayout {
  const all: (XyLinePoint | undefined)[] = plot.data.map((d, datum) => {
    if (d.y === undefined) {
      missing.add(plot.ast);
      return undefined;
    }
    const along = xAxis.scale(d.x);
    const across = yAxis.scale(held(d.y));
    return horizontal ? { datum, x: across, y: along } : { datum, x: along, y: across };
  });
  const points = all.filter((p): p is XyLinePoint => p !== undefined);
  const pointLabels: XyText[] = [];
  for (const p of points) {
    const text = plot.pointLabels?.[p.datum];
    if (!text) continue;
    const m = labels.kit.label(text, labels.font);
    pointLabels.push(
      horizontal
        ? place(m, { x: p.x + M.pointLabelOffset, y: p.y }, 'start', 'middle')
        : place(m, { x: p.x, y: p.y - M.pointLabelOffset }, 'middle', 'middle')
    );
  }
  return {
    kind: 'line',
    index: plot.index,
    ast: plot.ast,
    points,
    path: linePath(all),
    strokeWidth: M.lineStrokeWidth,
    pointLabels,
  };
}

/**
 * v12's data labels (`xychartRenderer.ts:102-226`), each bar plot with its own values (D382):
 * every bar with an area gets one; each tries font sizes down from a start until its text fits
 * by the 0.7 character-width approximation, and all take the smallest. None when that is not a
 * positive size (`XYCHART_LABEL_TOO_SMALL`).
 */
function withDataLabels(
  layout: XyBarPlotLayout,
  options: XyChartOptions,
  horizontal: boolean,
  family: string,
  kit: TextKit
): XyBarPlotLayout {
  const items = layout.bars
    .filter((b) => b.width > 0 && b.height > 0)
    .map((bar) => ({ bar, text: String(bar.value) }));
  if (items.length === 0) return layout;
  const char = M.dataLabelCharWidth;
  const margin = M.dataLabelMargin;
  const sizes = items.map(({ bar, text }) => {
    const n = text.length;
    if (horizontal) {
      // The largest fitting size: `size · n · 0.7 ≤ width − margin`.
      return fit(bar.height * M.dataLabelStart, (f) => f * n * char <= bar.width - margin);
    }
    return fit(bar.width / (n * char), (f) => {
      const w = f * n * char;
      const center = bar.x + bar.width / 2;
      const across = center - w / 2 >= bar.x && center + w / 2 <= bar.x + bar.width;
      return across && bar.y + margin + f <= bar.y + bar.height;
    });
  });
  let smallest = Infinity;
  for (const f of sizes) smallest = Math.min(smallest, f);
  const size = Math.floor(smallest);
  if (!(size > 0)) return layout;
  const font: FontKey = { family, size, weight: NORMAL_WEIGHT };
  const outside = options.showDataLabelOutsideBar;
  const dataLabels = items.map(({ bar, text }) => {
    const m = kit.plain(text, font);
    if (horizontal) {
      const x = outside ? bar.x + bar.width + margin : bar.x + bar.width - margin;
      return place(m, { x, y: bar.y + bar.height / 2 }, outside ? 'start' : 'end', 'middle');
    }
    const at: Point = { x: bar.x + bar.width / 2, y: outside ? bar.y - margin : bar.y + margin };
    return place(m, at, 'middle', outside ? 'alphabetic' : 'top');
  });
  return { ...layout, dataLabels };
}

/**
 * v12's `while (!fits(f) && f > 0) f -= 1` from `start`, with the steps that cannot fit skipped:
 * `fits` holds for every size at or under some bound, so start a step above where it can.
 */
function fit(start: number, fits: (f: number) => boolean): number {
  let f = start;
  // Jump close to the bound by halving the distance, then step as v12 did.
  let skip = Math.floor(f / 2);
  while (skip >= M.dataLabelStep) {
    if (!fits(f - skip)) f -= skip;
    skip = Math.floor(skip / 2);
  }
  // A size past 2^53 does not move by a step; v12 looped for ever there.
  while (!fits(f) && f > 0 && f - M.dataLabelStep !== f) f -= M.dataLabelStep;
  return f;
}

type Laid = Omit<XyChartLayout, 'bounds'>;

/** The canvas grown to cover everything drawn, strokes included (D224). */
function boundsOf(l: Laid): Rect {
  const b = new Box();
  b.add({ x: 0, y: 0, width: l.width, height: l.height });
  const text = (t: XyText | undefined): void => {
    if (t) b.add(textBounds(t));
  };
  const stroke = (s: Segment | undefined, w: number): void => {
    if (!s) return;
    b.addDisc({ x: s.x1, y: s.y1 }, w / 2);
    b.addDisc({ x: s.x2, y: s.y2 }, w / 2);
  };
  for (const axis of [l.xAxis, l.yAxis]) {
    stroke(axis.line, axis.lineWidth);
    for (const t of axis.ticks) {
      stroke(t.line, axis.tickWidth);
      text(t.label);
    }
    text(axis.title);
  }
  for (const p of l.plots) {
    if (p.kind === 'bar') {
      for (const bar of p.bars) b.add(bar);
      for (const t of p.dataLabels) text(t);
    } else {
      for (const pt of p.points) b.addDisc(pt, p.strokeWidth / 2);
      for (const t of p.pointLabels) text(t);
    }
  }
  if (l.legend) {
    for (const r of l.legend.rows) {
      if (r.swatch) b.add(r.swatch);
      stroke(r.stroke, M.lineStrokeWidth);
      text(r.label);
    }
  }
  text(l.title);
  return b.rect();
}

/** The union of what is drawn. */
class Box {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  addDisc(c: Point, r: number): void {
    this.add({ x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r });
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}
