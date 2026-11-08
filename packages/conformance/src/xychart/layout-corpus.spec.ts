import { beforeAll, describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutXyChart, parseXyChart } from '@mermaid-js/diagram-xychart';
import {
  xyChartLayoutViolations,
  xyChartTestContext,
  xyChartTestTheme,
} from '@mermaid-js/diagram-xychart/testing';
import type { CorpusItem } from '../types.ts';
import { xyChartGateCorpus, xyChartOrderCorpus } from './corpus.ts';

/**
 * Layout invariants on parser-produced fixtures (R-LAYOUT-3, #509's first criterion): every
 * source of the XY chart gate corpus (e2e fixtures, v12 spec strings, the cases and the recovery
 * set, each also in its line-break and comment variants) and every statement order, parsed by
 * the v13 parser, rejected sources included (the model of what parsed), laid out with the table
 * measurer under several `xyChart` configs, gives no `xyChartLayoutViolations`, and at most one
 * warning of each kind (D383).
 */
const CONFIGS: readonly Record<string, unknown>[] = [
  {},
  { chartOrientation: 'horizontal', showDataLabel: true },
  { showDataLabel: true, showDataLabelOutsideBar: true, xAxis: { labelRotation: 60 } },
  { width: 120, height: 40, plotReservedSpacePercent: 100 },
  { width: 3000, height: 90, legendFontSize: 40, titleFontSize: 50 },
  {
    xAxis: { showLabel: false, showTick: false },
    yAxis: { showAxisLine: false, showTitle: false },
  },
  // Outside the schema's ranges, as v12 takes them (story 6).
  { plotReservedSpacePercent: 20, legendPadding: -4, xAxis: { labelPadding: -3, tickLength: -2 } },
];

let theme: Theme;
let corpus: CorpusItem[];
beforeAll(async () => {
  theme = await xyChartTestTheme();
  corpus = [...(await xyChartGateCorpus()), ...(await xyChartOrderCorpus())];
});

describe('xychart layout invariants on parser-produced fixtures', () => {
  it('hold over the corpus and every config', () => {
    const failures: string[] = [];
    let plots = 0;
    for (const item of corpus) {
      const { model } = parseXyChart(item.source);
      plots += model.plots.length;
      for (const section of CONFIGS) {
        const warnings: Warning[] = [];
        const layout = layoutXyChart(model, xyChartTestContext(theme, section, { warnings }));
        const v = xyChartLayoutViolations(model, layout);
        const codes = warnings.map((w) => w.code);
        if (new Set(codes).size !== codes.length) v.push(`warnings repeat a kind: ${codes.join()}`);
        if (v.length > 0) failures.push(`${item.id} ${JSON.stringify(section)}: ${v.join('; ')}`);
      }
    }
    expect(corpus.filter((i) => i.id.startsWith('e2e/') && !i.id.endsWith(')')).length).toBe(48);
    expect(plots).toBeGreaterThan(2000);
    expect(failures.slice(0, 10)).toEqual([]);
  }, 120_000);
});
