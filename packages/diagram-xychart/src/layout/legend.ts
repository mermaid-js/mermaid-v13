/**
 * The XY chart legend (v12 `ChartLegend`, `chartBuilder/components/legend.ts`): the named plots'
 * rows, right of the plot, dropped whole when they do not fit. Its own module so the ported v12
 * legend spec reaches it through `./testing`, as v12's spec reached the component.
 */
import type { Size } from '@mermaid-js/core/layout';
import type { FontKey } from '@mermaid-js/core/text';
import { extraLines } from '@mermaid-js/shared/layout/geometry';
import type { XyChartOptions } from '../config.ts';
import type { XyChartModel, XyChartPlot } from '../model.ts';
import { XYCHART_METRICS } from './metrics.ts';
import { place, type Measured, type TextMeasure } from './text.ts';
import type { XyLegendLayout, XyLegendRow } from './types.ts';

const { legendMarker, legendItemSpacing, legendMarkerSpacing, lineStrokeWidth } = XYCHART_METRICS;

/** A named plot and its measured legend name: one legend row. */
interface LegendEntry {
  readonly plot: XyChartPlot;
  readonly text: Measured;
}

/**
 * v12 `ChartLegend`: the named plots, right of the plot, dropped whole when it does not fit.
 * A row is `legendFontSize` high, as v12's, plus a name's extra lines (D385).
 */
export class Legend {
  private rows: LegendEntry[] = [];
  private readonly box = { x: 0, y: 0, width: 0, height: 0 };
  private readonly marker: number;
  private readonly markerSpacing: number;
  private readonly itemSpacing: number;
  private readonly named: LegendEntry[];
  constructor(
    model: XyChartModel,
    private readonly options: XyChartOptions,
    private readonly font: FontKey,
    private readonly texts: TextMeasure
  ) {
    const size = options.legendFontSize;
    this.marker = size * legendMarker;
    this.markerSpacing = size * legendMarkerSpacing;
    this.itemSpacing = size * legendItemSpacing;
    this.named = options.showLegend
      ? model.plots
          .filter((p) => p.name)
          .map((plot) => ({ plot, text: texts.label(plot.name, font) }))
      : [];
  }

  calculateSpace(available: Size): Size {
    const n = this.named.length;
    if (n === 0) return { width: 0, height: 0 };
    const text = this.texts.max(
      this.named.map((r) => r.text),
      this.font
    );
    const pad = this.options.legendPadding;
    const width = pad * 2 + this.marker + this.markerSpacing + text.width;
    let extra = 0;
    for (const r of this.named) extra += extraLines(r.text);
    const height = pad * 2 + n * this.options.legendFontSize + extra + (n - 1) * this.itemSpacing;
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
    const x = this.box.x + pad;
    let y = this.box.y + pad;
    const rows = this.rows.map(({ plot, text }): XyLegendRow => {
      const mid = y + this.marker / 2;
      // A name of several lines keeps its first line where one line sits, and grows down.
      const at = { x: x + this.marker + this.markerSpacing, y: mid + extraLines(text) / 2 };
      const marker =
        plot.kind === 'bar'
          ? { swatch: { x, y, width: this.marker, height: this.marker } }
          : {
              stroke: { x1: x, y1: mid, x2: x + this.marker, y2: mid },
              strokeWidth: lineStrokeWidth,
            };
      const row: XyLegendRow = {
        index: plot.index,
        ast: plot.ast,
        kind: plot.kind,
        ...marker,
        label: place(text, at, 'start', 'middle'),
      };
      y += this.options.legendFontSize + extraLines(text) + this.itemSpacing;
      return row;
    });
    return { legend: { box: { ...this.box }, rows } };
  }
}
