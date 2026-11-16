// Draws a laid-out XY chart through the SvgWriter (spec #426 T4, DESIGN §7). The layout
// (`layoutXyChart`) placed everything in the canvas's coordinates; this file only paints it, in
// v12's order and nesting (`xychartRenderer.ts`, `chartBuilder/orchestrator.ts`): `g.main` with
// `rect.background`, then `g.chart-title`, `g.plot` > `g.bar-plot-<n>` / `g.line-plot-<n>`
// (> `g.labels`), `g.legend` > `g.markers` / `g.label`, and each axis's `g.<position>-axis` >
// `g.axis-line` (`g.axisl-line` on the left), `g.label`, `g.ticks`, `g.title`. A group whose
// parts are all hidden is not written, as v12 skipped a drawable with no data; a plot's group
// always is, so every plot has its `data-ast` element.
//
// `data-ast` is on each plot's group, each axis's group and the title's group, one element per
// AST node (pitfall 12); bars, lines, point labels, data labels and legend rows carry their
// plot's id as `data-id` only. Text is v12's: one `<text>` at `translate(x, y) rotate(r)` with
// its `text-anchor` and `dominant-baseline`; a label core lays out on several lines, or with
// styled runs or inline boxes (D385), is drawn by core's label writer with its box where the
// layout measured it.
import type { RenderContext } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';
import {
  rotate,
  transforms,
  translate,
  type Attrs,
  type PathData,
  type SvgWriter,
} from '@mermaid-js/core/svg';
import { openSvgRoot } from '@mermaid-js/shared/svg/document';
import type { MeasuredLabel } from '@mermaid-js/core/text';
import type {
  Segment,
  XyAxisLayout,
  XyBarPlotLayout,
  XyChartLayout,
  XyLegendLayout,
  XyLinePlotLayout,
  XyText,
} from '../layout/index.ts';
import type { XyChartModel } from '../model.ts';
import { paints, type AxisPaints, type Paints } from './paint.ts';

/** What the renderer reads from the render context. */
export type XyChartRenderContext = Pick<RenderContext, 'theme' | 'idPrefix' | 'version'>;

/** Writes the whole `<svg>` document for a laid-out XY chart. */
export function renderXyChart(
  model: XyChartModel,
  layout: XyChartLayout,
  ctx: XyChartRenderContext,
  w: SvgWriter
): void {
  const paint = paints(ctx.theme, layout);
  openRoot(model, layout, ctx, w);
  w.open('g', { class: 'main' });
  w.leaf('rect', {
    width: layout.width,
    height: layout.height,
    class: 'background',
    fill: paint.background,
  });
  if (layout.title) {
    w.open('g', { class: 'chart-title', 'data-ast': model.titleAst });
    drawText(w, layout.title, { fill: paint.title });
    w.close();
  }
  drawPlots(layout, paint, w);
  if (layout.legend) drawLegend(layout.legend, paint, w);
  drawAxis(layout.xAxis, paint.xAxis, w);
  drawAxis(layout.yAxis, paint.yAxis, w);
  w.close();
  w.close();
}

/**
 * v12's `dominant-baseline` for each of the layout's baselines (`getDominantBaseLine`, the data
 * labels').
 */
export const DOMINANT_BASELINE: Readonly<
  Record<XyText['baseline'], NonNullable<Attrs['dominant-baseline']>>
> = {
  top: 'text-before-edge',
  hanging: 'hanging',
  middle: 'middle',
  alphabetic: 'auto',
};

/**
 * A label's text when core drew it as one plain run (no break, style or inline box), so it is
 * written as v12's one `<text>`; `''` for an empty label. Undefined otherwise.
 */
function plainText(label: MeasuredLabel): string | undefined {
  if (label.lines.length === 0) return '';
  if (label.lines.length !== 1) return undefined;
  const line = label.lines[0]!;
  if (line.length === 0) return '';
  if (line.length !== 1) return undefined;
  const run = line[0]!;
  const styled =
    run.kind === 'box' ||
    run.bold === true ||
    run.italic === true ||
    run.underline === true ||
    run.strike === true ||
    run.attrs !== undefined;
  return styled ? undefined : run.text;
}

/**
 * `t` at its anchor, as v12 placed a `TextElem`: `translate(x, y) rotate(r)`, its anchor and its
 * baseline. A label of several lines, or with styled runs or inline boxes, goes through core's
 * label writer with its box where the layout measured it, in the same rotated frame.
 */
function drawText(w: SvgWriter, t: XyText, attrs: Attrs): void {
  const transform = transforms(translate(t.x, t.y), rotate(t.rotation));
  const size = t.font.size;
  const label = t.label;
  const text = label ? plainText(label) : t.text;
  if (text !== undefined) {
    w.open('text', {
      x: 0,
      y: 0,
      ...attrs,
      'font-size': size,
      'dominant-baseline': DOMINANT_BASELINE[t.baseline],
      'text-anchor': t.anchor,
      transform,
    });
    w.text(text);
    w.close();
  } else if (label) {
    const { box } = t;
    const cx = box.x - t.x + box.width / 2;
    const cy = box.y - t.y + box.height / 2;
    w.label(t.anchor === 'start' ? { ...label, left: true } : label, cx, cy, {
      ...attrs,
      'font-size': size,
      transform,
    });
  }
}

/** `M x1,y1 L x2,y2`. */
function segmentPath(w: SvgWriter, s: Segment): PathData {
  return w.path().moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).done();
}

/** v12 `g.plot`: each plot's group in model order (`bar-plot-<n>` can follow `line-plot-<m>`). */
function drawPlots(layout: XyChartLayout, paint: Paints, w: SvgWriter): void {
  if (layout.plots.length === 0) return;
  w.open('g', { class: 'plot' });
  for (const plot of layout.plots)
    if (plot.kind === 'bar') drawBars(plot, paint, w);
    else drawLine(plot, paint, w);
  w.close();
}

/**
 * v12 `BarPlot` and the renderer's data labels: each bar filled and stroked in the plot's
 * colour, stroke width 0; then the plot's own values (D382) in `xyChartDataLabelColor`.
 */
function drawBars(plot: XyBarPlotLayout, paint: Paints, w: SvgWriter): void {
  const fill = paint.plot(plot.index);
  const id: AstId = plot.ast;
  w.open('g', { class: `bar-plot-${plot.index}`, 'data-ast': id });
  for (const b of plot.bars)
    w.leaf('rect', {
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fill,
      stroke: fill,
      'stroke-width': 0,
      'data-id': id,
    });
  // The layout chooses each data label's baseline (`hanging` inside a vertical bar,
  // `withDataLabels`); this draws it.
  for (const t of plot.dataLabels) drawText(w, t, { fill: paint.dataLabel, 'data-id': id });
  w.close();
}

/** v12 `LinePlot`: the line stroked in the plot's colour, then its point labels in it (D384). */
function drawLine(plot: XyLinePlotLayout, paint: Paints, w: SvgWriter): void {
  const stroke = paint.plot(plot.index);
  const id: AstId = plot.ast;
  w.open('g', { class: `line-plot-${plot.index}`, 'data-ast': id });
  if (plot.path !== '')
    w.leaf('path', {
      // The layout's d3 `line()` path: it writes numbers only (`layout/scale.ts` `linePath`).
      d: plot.path as PathData,
      fill: 'none',
      stroke,
      'stroke-width': plot.strokeWidth,
      'data-id': id,
    });
  if (plot.pointLabels.length > 0) {
    w.open('g', { class: 'labels' });
    for (const t of plot.pointLabels) drawText(w, t, { fill: stroke, 'data-id': id });
    w.close();
  }
  w.close();
}

/** v12 `ChartLegend`: the bar swatches, then the line strokes, then the names. */
function drawLegend(legend: XyLegendLayout, paint: Paints, w: SvgWriter): void {
  w.open('g', { class: 'legend' });
  w.open('g', { class: 'markers' });
  for (const row of legend.rows) {
    if (!row.swatch) continue;
    const fill = paint.plot(row.index);
    w.leaf('rect', { ...row.swatch, fill, stroke: fill, 'stroke-width': 0, 'data-id': row.ast });
  }
  for (const row of legend.rows) {
    if (!row.stroke) continue;
    w.leaf('path', {
      d: segmentPath(w, row.stroke),
      fill: 'none',
      stroke: paint.plot(row.index),
      'stroke-width': row.strokeWidth,
      'data-id': row.ast,
    });
  }
  w.close();
  w.open('g', { class: 'label' });
  for (const row of legend.rows)
    drawText(w, row.label, { fill: paint.legendText, 'data-id': row.ast });
  w.close();
  w.close();
}

/**
 * v12 `BaseAxis`: `g.<position>-axis` with the axis line (`axisl-line` on a left axis, as
 * v12), the tick labels, the ticks and the title, each group only when it draws something.
 */
function drawAxis(axis: XyAxisLayout, paint: AxisPaints, w: SvgWriter): void {
  const labels = axis.ticks.flatMap((t) => (t.label ? [t.label] : []));
  const ticks = axis.ticks.flatMap((t) => (t.line ? [t.line] : []));
  if (!axis.line && labels.length === 0 && ticks.length === 0 && !axis.title) return;
  w.open('g', { class: `${axis.position}-axis`, 'data-ast': axis.ast });
  if (axis.line) {
    w.open('g', { class: axis.position === 'left' ? 'axisl-line' : 'axis-line' });
    w.leaf('path', {
      d: segmentPath(w, axis.line),
      fill: 'none',
      stroke: paint.line,
      'stroke-width': axis.lineWidth,
    });
    w.close();
  }
  if (labels.length > 0) {
    w.open('g', { class: 'label' });
    for (const t of labels) drawText(w, t, { fill: paint.label });
    w.close();
  }
  if (ticks.length > 0) {
    w.open('g', { class: 'ticks' });
    for (const s of ticks)
      w.leaf('path', {
        d: segmentPath(w, s),
        fill: 'none',
        stroke: paint.tick,
        'stroke-width': axis.tickWidth,
      });
    w.close();
  }
  if (axis.title) {
    w.open('g', { class: 'title' });
    drawText(w, axis.title, { fill: paint.title });
    w.close();
  }
  w.close();
}

/** The `<svg>` root with its title and description (R-A11Y-1, D133). */
function openRoot(
  model: XyChartModel,
  layout: XyChartLayout,
  ctx: XyChartRenderContext,
  w: SvgWriter
): void {
  const { theme } = ctx;
  const { x, y } = layout.bounds;
  const width = Math.max(1, Math.ceil(layout.bounds.width));
  const height = Math.max(1, Math.ceil(layout.bounds.height));
  // D387: `useMaxWidth` is honoured (v12 always scaled to the container).
  const maxWidth = layout.useMaxWidth;
  const title = model.accTitle.trim();
  const desc = model.accDescr.trim();
  // Read before the root style is written, so it declares its alias.
  const font = theme.font();
  openSvgRoot(w, ctx, {
    name: 'xychart',
    viewBox: [x, y, width, height],
    maxWidth,
    title,
    desc,
    attrs: { 'font-family': font },
  });
}
