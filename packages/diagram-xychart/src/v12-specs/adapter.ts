/**
 * Test-only adapter for the ported v12 XY chart specs (R-TEST-3): v12's `xychart.jison` parser
 * and `xychartDb`, backed by the v13 parse and model builder. The specs' expectations are kept as
 * v12 wrote them; this file only translates names and shapes:
 *
 * - `parser.parse(text)` throws on a syntax error diagnostic (not on "no plot", which v12 found
 *   at render), else calls `parser.yy` (the spec's mock DB) as v12's grammar did, statement by
 *   statement: texts untrimmed as `{ text, type: 'text' }`, an axis's data before its title (`''`
 *   without one), a plot's values as `{ value, label }`;
 * - `db` is v12's DB API over {@link XyChartBuilder}, with `getXYChartData()` in v12's shape
 *   (`[x, y]` pairs, `undefined` for a missing value).
 */
import { XyChartBuilder } from '../parser/build.ts';
import type { XyChartPointInput } from '../parser/build.ts';
import { parseXyChart } from '../parser/index.ts';
import type { XyChartStatementNode } from '../parser/index.ts';

type Db = Record<string, ((...args: unknown[]) => unknown) | undefined>;

interface NormalText {
  text: string;
  type: 'text';
}

const text = (t: string): NormalText => ({ text: t, type: 'text' });

/** Call the spec's mock DB for one statement, as v12's grammar did. */
function replay(yy: Db, n: XyChartStatementNode): void {
  if (n.type === 'Header') {
    if (n.orientation !== undefined) yy.setOrientation?.(n.orientation);
  } else if (n.type === 'Title') yy.setDiagramTitle?.(n.text);
  else if (n.type === 'AccTitle') yy.setAccTitle?.(n.text);
  else if (n.type === 'AccDescr') yy.setAccDescription?.(n.text);
  else if (n.type === 'Axis') {
    const x = n.axis === 'x';
    if (n.categories) yy.setXAxisBand?.(n.categories.map((c) => text(c.text)));
    else if (n.data) {
      const range = x ? yy.setXAxisRangeData : yy.setYAxisRangeData;
      range?.(Number(n.data.min), Number(n.data.max));
    }
    (x ? yy.setXAxisTitle : yy.setYAxisTitle)?.(text(n.title?.text ?? ''));
  } else {
    const points = n.points.map((p) => ({ value: Number(p.value), label: p.label ?? '' }));
    (n.kind === 'line' ? yy.setLineData : yy.setBarData)?.(text(n.name?.text ?? ''), points);
  }
}

export const parser = {
  yy: {} as Db,
  parse(source: string): void {
    const result = parseXyChart(source);
    const error = result.diagnostics.find(
      (d) => d.severity === 'error' && d.code !== 'XYCHART_NO_PLOT'
    );
    if (error) throw new Error(error.message);
    for (const n of result.ast.children) replay(parser.yy, n);
  },
};

/** v12's `getXYChartData()` shape. */
interface V12Data {
  xAxis: Record<string, unknown>;
  yAxis: Record<string, unknown>;
  plots: Record<string, unknown>[];
}

let builder = new XyChartBuilder();

/** v12's `xychartDb`, as far as its spec calls it. */
export const db = {
  clear(): void {
    builder = new XyChartBuilder();
  },
  setXAxisBand(categories: NormalText[]): void {
    builder.setXAxisBand(categories.map((c) => c.text));
  },
  setLineData(title: NormalText, points: XyChartPointInput[]): void {
    builder.addPlot('line', title.text, points);
  },
  setBarData(title: NormalText, points: XyChartPointInput[]): void {
    builder.addPlot('bar', title.text, points);
  },
  getXYChartData(): V12Data {
    const x = builder.xAxis(undefined);
    const y = builder.yAxis(undefined);
    return {
      xAxis:
        x.kind === 'band'
          ? { type: 'band', title: x.title, categories: [...x.categories] }
          : { type: 'linear', title: x.title, min: x.min, max: x.max },
      yAxis: { type: 'linear', title: y.title, min: y.min, max: y.max },
      plots: builder.plots.map((p) => ({
        type: p.kind,
        title: p.name,
        data: p.data.map((d) => [d.x, d.y]),
        ...(p.pointLabels ? { pointLabels: [...p.pointLabels] } : {}),
      })),
    };
  },
};
