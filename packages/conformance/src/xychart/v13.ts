/**
 * The v13 side of XY chart parity: the xychart parser and the normaliser from its
 * `XyChartModel` to the {@link XyChartSnapshot} that `v12.ts` takes from mermaid\@12's DB.
 */
import { detectXyChart, parseXyChart } from '@mermaid-js/diagram-xychart';
import type { XyChartModel } from '@mermaid-js/diagram-xychart';
import type { DiagramAdapter } from '../types.ts';
import { XYCHART_V12_TYPES, xyChartV12Snapshot } from './v12.ts';
import type { XyChartSnapshot } from './v12.ts';

/** The length of v12's default palette, which the oracle's plots take their colours from. */
const PALETTE_LENGTH = 10;

export function xyChartV13Snapshot(model: XyChartModel): XyChartSnapshot {
  const x = model.xAxis;
  return {
    orientation: model.orientation ?? 'vertical',
    // The oracle never passes the front-matter title on (D218: a render spec covers it).
    title: model.titleAst === undefined ? '' : (model.title ?? ''),
    accTitle: model.accTitle,
    accDescr: model.accDescr,
    xAxis:
      x.kind === 'band'
        ? { type: 'band', title: x.title, categories: [...x.categories] }
        : { type: 'linear', title: x.title, min: x.min, max: x.max },
    yAxis: { title: model.yAxis.title, min: model.yAxis.min, max: model.yAxis.max },
    plots: model.plots.map((p) => ({
      type: p.kind,
      title: p.name,
      slot: p.index % PALETTE_LENGTH,
      data: p.data.map((d): [string, number | null] => [d.x, d.y ?? null]),
      pointLabels: p.pointLabels ? [...p.pointLabels] : null,
    })),
  };
}

/** v13 parse for parity: the model, or a throw carrying the first error diagnostic. */
export function parseXyChartForParity(text: string): XyChartModel {
  const result = parseXyChart(text);
  const error = result.diagnostics.find((d) => d.severity === 'error');
  if (error) throw new Error(`${error.code}: ${error.message}`);
  return result.model;
}

export const xyChartAdapter: DiagramAdapter<XyChartModel> = {
  id: 'xychart',
  v12Types: XYCHART_V12_TYPES,
  detect: (text) => detectXyChart(text),
  parse: parseXyChartForParity,
  normaliseV13: xyChartV13Snapshot,
  normaliseV12: xyChartV12Snapshot,
};
