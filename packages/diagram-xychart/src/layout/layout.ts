/**
 * The XY chart custom layout (spec #426 T3, `layoutKind: 'custom'`): `XyChartModel` in,
 * `XyChartLayout` out. It is v12's chart builder (`chartBuilder/orchestrator.ts` and its
 * components) without d3 or the DOM: every text is measured first through the injected measurer
 * (core label layout for what the author writes, D385), then space is handed out in v12's order:
 * the plot's reserved share, the title, the x axis, the y axis, the legend, and the rest to the
 * plot. Bars, lines, point labels and data labels follow v12's components and renderer. Lengths
 * come from the `xyChart` config, the measurer and the metrics table (pitfall 13).
 *
 * Changed from v12 by decision:
 * - each bar plot's data labels are its own values, not plot 0's (D382);
 * - a missing value draws no bar, point or label (`XYCHART_MISSING_VALUE`); an empty range maps
 *   every value to the axis middle (`XYCHART_EMPTY_RANGE`); one warning per kind (D383);
 * - a bar with no room for its data label gets none, and the others are drawn at the smallest
 *   size that fits them, one size for every bar plot of the chart; `XYCHART_LABEL_TOO_SMALL`
 *   when no bar of the chart has room (D611, D748);
 * - a legend name of several lines (D385) pushes the rows after it down by its extra lines;
 * - by the T3 invariant ("bars inside the plot box from axis to value"), not a D-id: a bar is
 *   held inside the plot box, where v12 drew a value past an end of the range with a negative
 *   size or out of the plot; and legend markers get no data labels (v12 labelled every `rect`,
 *   `xychartRenderer.ts:102`). Both are maintainer choices (`GAPS.md` #509).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { Size } from '@mermaid-js/core/layout';
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey } from '@mermaid-js/core/text';
import { RectUnion } from '@mermaid-js/shared/layout';
import { ignoreWarning, XYCHART_SECTION, xyChartOptions, type XyChartOptions } from '../config.ts';
import type { XyChartModel, XyChartPlot } from '../model.ts';
import { Axis, type AxisData } from './axis.ts';
import { NORMAL_WEIGHT, XYCHART_METRICS } from './metrics.ts';
import { linePath } from './scale.ts';
import { place, textMeasure, type Measured, type TextMeasure } from './text.ts';
import type {
  Point,
  Rect,
  XyBar,
  XyBarPlotLayout,
  XyChartLayout,
  XyLinePlotLayout,
  XyLinePoint,
  XyPlotLayout,
  XyText,
} from './types.ts';
import { Legend } from './legend.ts';
import { clamp, visitDrawn, type UnboundedLayout } from './walk.ts';

/** What the layout reads from the render context. */
export type XyChartLayoutContext = Pick<RenderContext, 'config' | 'measurer' | 'theme'> &
  Partial<Pick<RenderContext, 'inline' | 'warn'>>;

export const XYCHART_MISSING_VALUE = 'XYCHART_MISSING_VALUE';
export const XYCHART_EMPTY_RANGE = 'XYCHART_EMPTY_RANGE';
export const XYCHART_LABEL_TOO_SMALL = 'XYCHART_LABEL_TOO_SMALL';

const {
  barPadding,
  pointLabelFontSize,
  pointLabelOffset,
  lineStrokeWidth,
  dataLabelCharWidth,
  dataLabelMargin,
  dataLabelStart,
  dataLabelStep,
  valueLimit,
} = XYCHART_METRICS;

/** `v` held to ±`valueLimit` (a 309-digit value is Infinity). */
const finiteValue = (v: number): number => clamp(v, -valueLimit, valueLimit);

/** Lays out an XY chart in px. */
export function layoutXyChart(model: XyChartModel, ctx: XyChartLayoutContext): XyChartLayout {
  const options = xyChartOptions(
    ctx.config[XYCHART_SECTION] as Readonly<Record<string, unknown>> | undefined,
    ctx.warn
  );
  const warn = once(ctx.warn ?? ignoreWarning);
  const family = ctx.theme.value('fontFamily');
  const texts = textMeasure(ctx.measurer, ctx.inline);
  const orientation = model.orientation ?? options.chartOrientation;
  const horizontal = orientation === 'horizontal';

  // The axes' data: v12's DB values, ranges held finite (D383).
  const x = model.xAxis;
  const xData: AxisData =
    x.kind === 'band'
      ? { kind: 'band', categories: x.categories }
      : { kind: 'linear', domain: [finiteValue(x.min), finiteValue(x.max)] };
  const yData: AxisData = {
    kind: 'linear',
    domain: [finiteValue(model.yAxis.min), finiteValue(model.yAxis.max)],
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
  const axisOf = (
    data: AxisData,
    title: string,
    ast: AstId | undefined,
    which: 'xAxis' | 'yAxis'
  ) =>
    new Axis({
      data,
      title,
      ...(ast === undefined ? {} : { ast }),
      options: options[which],
      family,
      weight: NORMAL_WEIGHT,
      texts,
    });
  const xAxis = axisOf(xData, x.title, x.ast, 'xAxis');
  const yAxis = axisOf(yData, model.yAxis.title, model.yAxis.ast, 'yAxis');
  const legend = new Legend(model, options, font(options.legendFontSize), texts);
  const titleText = model.title ? texts.label(model.title, font(options.titleFontSize)) : undefined;
  const title = new Title(titleText, options);

  const plot = allotSpace(options, horizontal, { title, xAxis, yAxis, legend });
  if (model.plots.some((p) => p.kind === 'bar')) xAxis.padForBars();

  const missing = new Set<AstId>();
  const pointLabels = { font: font(pointLabelFontSize), texts };
  const plots = model.plots.map((p) =>
    p.kind === 'bar'
      ? barPlot(p, plot, { xAxis, yAxis }, horizontal, missing)
      : linePlot(p, { xAxis, yAxis }, horizontal, pointLabels, missing)
  );
  if (missing.size > 0)
    warn(
      XYCHART_MISSING_VALUE,
      'A plot has fewer values than categories: those points are not drawn',
      [...missing]
    );
  const labelled = options.showDataLabel
    ? withDataLabels(plots, options, horizontal, family, texts)
    : plots;
  const barPlots = labelled.filter(
    (p): p is XyBarPlotLayout => p.kind === 'bar' && p.bars.length > 0
  );
  if (options.showDataLabel && barPlots.length > 0 && barPlots.every((p) => !p.dataLabels.length))
    warn(
      XYCHART_LABEL_TOO_SMALL,
      'No bar has room for a data label: none are drawn',
      barPlots.map((p) => p.ast)
    );

  const layout: UnboundedLayout = {
    orientation,
    useMaxWidth: options.useMaxWidth,
    width: options.width,
    height: options.height,
    plot,
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

  calculateSpace(available: Size): Size {
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

interface Components {
  readonly title: Title;
  readonly xAxis: Axis;
  readonly yAxis: Axis;
  readonly legend: Legend;
}

/**
 * v12 `calculateVerticalSpace`/`calculateHorizontalSpace` (`orchestrator.ts:61-199`): the plot
 * reserves its share, the title takes a row, the axes take what they need (x bottom and y left,
 * or x left and y top), the legend takes its width, and the plot grows into what is left.
 */
function allotSpace(options: XyChartOptions, horizontal: boolean, c: Components): Rect {
  const { title, xAxis, yAxis, legend } = c;
  let width = options.width;
  let height = options.height;
  let plotWidth = Math.floor((width * options.plotReservedSpacePercent) / 100);
  let plotHeight = Math.floor((height * options.plotReservedSpacePercent) / 100);
  width -= plotWidth;
  height -= plotHeight;
  const titleHeight = title.calculateSpace({ width: options.width, height }).height;
  height -= titleHeight;
  let plotX: number;
  let plotY: number;
  if (horizontal) {
    xAxis.setPosition('left');
    plotX = xAxis.calculateSpace({ width, height }).width;
    width -= plotX;
    yAxis.setPosition('top');
    const yHeight = yAxis.calculateSpace({ width, height }).height;
    height -= yHeight;
    plotY = titleHeight + yHeight;
  } else {
    plotY = titleHeight;
    xAxis.setPosition('bottom');
    height -= xAxis.calculateSpace({ width, height }).height;
    yAxis.setPosition('left');
    plotX = yAxis.calculateSpace({ width, height }).width;
    width -= plotX;
  }
  const legendSize = legend.calculateSpace({ width, height: plotHeight });
  width -= legendSize.width;
  if (width > 0) plotWidth += width;
  if (height > 0) plotHeight += height;
  title.alignTo(plotX, plotX + plotWidth);
  legend.setOrigin(plotX + plotWidth, plotY + Math.max((plotHeight - legendSize.height) / 2, 0));
  if (horizontal) {
    yAxis.setRange([plotX, plotX + plotWidth]);
    yAxis.setOrigin(plotX, titleHeight);
    xAxis.setRange([plotY, plotY + plotHeight]);
    xAxis.setOrigin(0, plotY);
  } else {
    xAxis.setRange([plotX, plotX + plotWidth]);
    xAxis.setOrigin(plotX, plotY + plotHeight);
    yAxis.setRange([plotY, plotY + plotHeight]);
    yAxis.setOrigin(0, plotY);
  }
  return { x: plotX, y: plotY, width: plotWidth, height: plotHeight };
}

interface Axes {
  readonly xAxis: Axis;
  readonly yAxis: Axis;
}

/**
 * v12 `BarPlot` (`plot/barPlot.ts`): bars `0.95 · min(2 · outerPadding, tickDistance)` wide,
 * from the plot's bottom (vertical) or left edge (horizontal) to the value. A bar is held inside
 * the plot box: its value end at the box's edge, and its sides cut there (a plot written before
 * its `x-axis` can sit past a linear range, D386). A missing value draws no bar.
 */
function barPlot(
  plot: XyChartPlot,
  box: Rect,
  { xAxis, yAxis }: Axes,
  horizontal: boolean,
  missing: Set<AstId>
): XyBarPlotLayout {
  const size = Math.min(xAxis.outerPadding() * 2, xAxis.tickDistance()) * (1 - barPadding);
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  const bars: XyBar[] = [];
  plot.data.forEach((d, datum) => {
    if (d.y === undefined) {
      missing.add(plot.ast);
      return;
    }
    const value = finiteValue(d.y);
    const lo = xAxis.scale(d.x) - size / 2;
    if (horizontal) {
      const end = clamp(yAxis.scale(value), box.x, right);
      const [y, height] = within(lo, size, box.y, bottom);
      bars.push({ datum, value, x: box.x, y, width: end - box.x, height });
    } else {
      const end = clamp(yAxis.scale(value), box.y, bottom);
      const [x, width] = within(lo, size, box.x, right);
      bars.push({ datum, value, x, y: end, width, height: bottom - end });
    }
  });
  return { kind: 'bar', index: plot.index, ast: plot.ast, bars, dataLabels: [] };
}

/**
 * The span `[start, start + size]` cut to `[lo, hi]`, as `[start, size]`: as given (bit for
 * bit, so v12's data-label fit sees the same sizes) when it is inside.
 */
function within(start: number, size: number, lo: number, hi: number): [number, number] {
  if (start >= lo && start + size <= hi) return [start, size];
  const a = clamp(start, lo, hi);
  return [a, clamp(start + size, lo, hi) - a];
}

/** v12 `LinePlot` (`plot/linePlot.ts`): d3 `line()` through the points, and the point labels. */
function linePlot(
  plot: XyChartPlot,
  { xAxis, yAxis }: Axes,
  horizontal: boolean,
  labels: { readonly font: FontKey; readonly texts: TextMeasure },
  missing: Set<AstId>
): XyLinePlotLayout {
  const all: (XyLinePoint | undefined)[] = plot.data.map((d, datum) => {
    if (d.y === undefined) {
      missing.add(plot.ast);
      return undefined;
    }
    const along = xAxis.scale(d.x);
    const across = yAxis.scale(finiteValue(d.y));
    return horizontal ? { datum, x: across, y: along } : { datum, x: along, y: across };
  });
  const points = all.filter((p): p is XyLinePoint => p !== undefined);
  const pointLabels: XyText[] = [];
  for (const p of points) {
    const text = plot.pointLabels?.[p.datum];
    if (!text) continue;
    const m = labels.texts.label(text, labels.font);
    pointLabels.push(
      horizontal
        ? place(m, { x: p.x + pointLabelOffset, y: p.y }, 'start', 'middle')
        : place(m, { x: p.x, y: p.y - pointLabelOffset }, 'middle', 'middle')
    );
  }
  return {
    kind: 'line',
    index: plot.index,
    ast: plot.ast,
    points,
    path: linePath(all),
    strokeWidth: lineStrokeWidth,
    pointLabels,
  };
}

/** A bar's data label text and the largest font size it fits at, over 0. */
interface Fitted {
  readonly bar: XyBar;
  readonly text: string;
  readonly size: number;
}

/**
 * v12's data labels (`xychartRenderer.ts:102-226`), each bar plot with its own values (D382):
 * every bar with an area may get one; each tries font sizes down from a start until its text
 * fits by the 0.7 character-width approximation. A bar whose fitted size is under 1 px has no
 * room and gets no label; the others, in every bar plot of the chart, all take the smallest of
 * their sizes (D611, D748; #537: v12 took the smallest over every bar of a plot and wrote a size
 * of 0 or less). None when no bar has room (`XYCHART_LABEL_TOO_SMALL`).
 */
function withDataLabels(
  plots: readonly XyPlotLayout[],
  options: XyChartOptions,
  horizontal: boolean,
  family: string,
  texts: TextMeasure
): XyPlotLayout[] {
  const fitted = plots.map((p) => (p.kind === 'bar' ? fittedLabels(p, horizontal) : []));
  const size = fitted.flat().reduce((min, item) => Math.min(min, item.size), Infinity);
  if (size === Infinity) return [...plots];
  const font: FontKey = { family, size, weight: NORMAL_WEIGHT };
  const outside = options.showDataLabelOutsideBar;
  const margin = dataLabelMargin;
  return plots.map((p, i) => {
    const items = fitted[i]!;
    if (p.kind !== 'bar' || items.length === 0) return p;
    const dataLabels = items.map(({ bar, text }) => {
      const m = texts.plain(text, font);
      if (horizontal) {
        const x = outside ? bar.x + bar.width + margin : bar.x + bar.width - margin;
        return place(m, { x, y: bar.y + bar.height / 2 }, outside ? 'start' : 'end', 'middle');
      }
      const at: Point = { x: bar.x + bar.width / 2, y: outside ? bar.y - margin : bar.y + margin };
      return place(m, at, 'middle', outside ? 'alphabetic' : 'hanging');
    });
    return outside ? { ...p, dataLabels, dataLabelsOutside: true } : { ...p, dataLabels };
  });
}

/** The bars of one plot that have room for their data label, each with its fitted size. */
function fittedLabels(layout: XyBarPlotLayout, horizontal: boolean): Fitted[] {
  const char = dataLabelCharWidth;
  const margin = dataLabelMargin;
  return layout.bars
    .filter((b) => b.width > 0 && b.height > 0)
    .map((bar) => {
      const text = String(bar.value);
      const n = text.length;
      const fitted = horizontal
        ? fit(bar.height * dataLabelStart, (f) => f * n * char <= bar.width - margin)
        : fit(bar.width / (n * char), (f) => {
            const w = f * n * char;
            const center = bar.x + bar.width / 2;
            const across = center - w / 2 >= bar.x && center + w / 2 <= bar.x + bar.width;
            return across && bar.y + margin + f <= bar.y + bar.height;
          });
      return { bar, text, size: Math.floor(fitted) };
    })
    .filter((item) => item.size > 0);
}

/**
 * v12's `while (!fits(f) && f > 0) f -= 1` from `start`, with the steps that cannot fit skipped:
 * `fits` holds for every size at or under some bound, so start a step above where it can.
 */
function fit(start: number, fits: (f: number) => boolean): number {
  let f = start;
  // Jump close to the bound by halving the distance, then step as v12 did.
  let skip = Math.floor(f / 2);
  while (skip >= dataLabelStep) {
    if (!fits(f - skip)) f -= skip;
    skip = Math.floor(skip / 2);
  }
  // A size past 2^53 does not move by a step; v12 looped for ever there.
  while (!fits(f) && f > 0 && f - dataLabelStep !== f) f -= dataLabelStep;
  return f;
}

/** The canvas grown to cover everything drawn, strokes included (D224). */
function boundsOf(l: UnboundedLayout): Rect {
  const box = new RectUnion();
  box.add({ x: 0, y: 0, width: l.width, height: l.height });
  visitDrawn(l, {
    box: (r) => box.add(r),
    dot: (p, w) => box.add({ x: p.x - w / 2, y: p.y - w / 2, width: w, height: w }),
  });
  return box.rect();
}
