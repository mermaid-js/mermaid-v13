/**
 * The model's axes and plots, built statement by statement as v12's DB built them
 * (`xychartDb.ts`): the same setters, in the same order, with the same order-dependent rules
 * (see `model.ts`). The parser calls it for each statement; the ported v12 DB spec drives it
 * directly. One builder per parse.
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type {
  XyChartBandAxis,
  XyChartDatum,
  XyChartLinearAxis,
  XyChartPlot,
  XyChartXAxis,
  XyChartYAxis,
} from '../model.ts';

/** One value of a plot statement, as the grammar read it. */
export interface XyChartPointInput {
  readonly value: number;
  /** The point label, untrimmed; `''` for none. */
  readonly label: string;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export class XyChartBuilder {
  private x: XyChartBandAxis | XyChartLinearAxis = { kind: 'band', title: '', categories: [] };
  private y: Mutable<XyChartLinearAxis> = {
    kind: 'linear',
    title: '',
    min: Infinity,
    max: -Infinity,
  };
  /** v12's `hasSetXAxis`: categories or a range were given, or inferred from the first plot. */
  private hasX = false;
  /** v12's `hasSetYAxis`: a range was given. */
  private hasY = false;
  readonly plots: XyChartPlot[] = [];

  setXAxisTitle(text: string): void {
    this.x = { ...this.x, title: text.trim() };
  }

  setXAxisRange(min: number, max: number): void {
    this.x = { kind: 'linear', title: this.x.title, min, max };
    this.hasX = true;
  }

  setXAxisBand(categories: readonly string[]): void {
    this.x = { kind: 'band', title: this.x.title, categories: categories.map((c) => c.trim()) };
    this.hasX = true;
  }

  setYAxisTitle(text: string): void {
    this.y.title = text.trim();
  }

  setYAxisRange(min: number, max: number): void {
    this.y = { kind: 'linear', title: this.y.title, min, max };
    this.hasY = true;
  }

  /** A `bar` or `line` statement. Bar point labels are read and dropped, as in v12. */
  addPlot(
    kind: 'bar' | 'line',
    name: string,
    points: readonly XyChartPointInput[],
    ast: AstId
  ): XyChartPlot {
    const values = points.map((p) => p.value);
    const plot: Mutable<XyChartPlot> = {
      ast,
      kind,
      name: name.trim(),
      index: this.plots.length,
      values,
      data: this.transform(values),
    };
    if (kind === 'line') {
      const labels = points.map((p) => (p.label ? p.label.trim() : ''));
      if (labels.some((l) => l !== '')) plot.pointLabels = labels;
    }
    this.plots.push(plot);
    return plot;
  }

  xAxis(ast: AstId | undefined): XyChartXAxis {
    return ast === undefined ? { ...this.x } : { ...this.x, ast };
  }

  yAxis(ast: AstId | undefined): XyChartYAxis {
    const empty = this.y.min > this.y.max && !this.hasY;
    const axis: Mutable<XyChartYAxis> = {
      ...this.y,
      ...(empty ? { min: 0, max: 0 } : {}),
      explicit: this.hasY,
    };
    if (ast !== undefined) axis.ast = ast;
    return axis;
  }

  /** v12's `transformDataWithoutCategory`. */
  private transform(values: readonly number[]): XyChartDatum[] {
    if (values.length === 0) return [];
    if (!this.hasX) {
      const prev = this.x.kind === 'linear' ? this.x : { min: Infinity, max: -Infinity };
      this.setXAxisRange(Math.min(prev.min, 1), Math.max(prev.max, values.length));
    }
    const x = this.x;
    const data =
      x.kind === 'band' && values.length > x.categories.length
        ? values.slice(0, x.categories.length)
        : values;
    if (!this.hasY) this.widenY(data);
    if (x.kind === 'band') {
      return x.categories.map((c, i): XyChartDatum => {
        const y = data[i];
        return y === undefined ? { x: c } : { x: c, y };
      });
    }
    const { min, max } = x;
    if (data.length === 1) return [{ x: `${min}`, y: data[0] as number }];
    const step = (max - min) / (data.length - 1);
    return data.map((y, i) => ({ x: `${min + i * step}`, y }));
  }

  /** v12's `setYAxisRangeFromPlotData` (a loop: `Math.min(...data)` overflows on long plots). */
  private widenY(data: readonly number[]): void {
    let min = this.y.min;
    let max = this.y.max;
    for (const v of data) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    this.y.min = min;
    this.y.max = max;
  }
}
