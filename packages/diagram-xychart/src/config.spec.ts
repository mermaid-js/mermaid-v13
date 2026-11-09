// The `xyChart` option reader (#513): every option has a generated default (the defaults are
// typed `XYChartConfig`, all optional, so a key the schema loses would not fail typecheck),
// and a value of the wrong type warns once per key and draws the default.
import { describe, expect, it } from 'vitest';
import type { Warning } from '@mermaid-js/core';
import { XYCHART_CONFIG_INVALID, xyChartOptions } from './config.ts';

const OPTIONS = [
  'useMaxWidth',
  'width',
  'height',
  'titleFontSize',
  'titlePadding',
  'showDataLabel',
  'showDataLabelOutsideBar',
  'showTitle',
  'showLegend',
  'legendFontSize',
  'legendPadding',
  'chartOrientation',
  'plotReservedSpacePercent',
  'xAxis',
  'yAxis',
];
const AXIS = [
  'showLabel',
  'labelFontSize',
  'labelPadding',
  'showTitle',
  'titleFontSize',
  'titlePadding',
  'showTick',
  'tickLength',
  'tickWidth',
  'showAxisLine',
  'axisLineWidth',
  'labelRotation',
];

describe('xyChartOptions', () => {
  it('sets every option and every axis option from the generated defaults', () => {
    const o = xyChartOptions(undefined);
    expect(Object.keys(o).sort()).toEqual([...OPTIONS].sort());
    for (const v of Object.values(o)) expect(v).not.toBeUndefined();
    for (const axis of [o.xAxis, o.yAxis]) {
      expect(Object.keys(axis).sort()).toEqual([...AXIS].sort());
      for (const v of Object.values(axis)) expect(typeof v).toMatch(/^(number|boolean)$/);
    }
  });

  it('warns once per key of the wrong type, takes numbers outside the schema range', () => {
    const warnings: Warning[] = [];
    const o = xyChartOptions(
      {
        width: 'wide',
        height: '300',
        titlePadding: -5,
        showLegend: 'no',
        chartOrientation: 'HORIZONTAL',
        xAxis: 3,
        yAxis: { tickLength: [] },
      },
      (w) => warnings.push(w)
    );
    expect(warnings.map((w) => [w.code, w.path])).toEqual([
      [XYCHART_CONFIG_INVALID, 'xyChart.width'],
      [XYCHART_CONFIG_INVALID, 'xyChart.showLegend'],
      [XYCHART_CONFIG_INVALID, 'xyChart.chartOrientation'],
      [XYCHART_CONFIG_INVALID, 'xyChart.xAxis'],
      [XYCHART_CONFIG_INVALID, 'xyChart.yAxis.tickLength'],
    ]);
    expect([o.width, o.height, o.titlePadding, o.showLegend, o.chartOrientation]).toEqual([
      700,
      300,
      -5,
      true,
      'vertical',
    ]);
    expect(o.yAxis.tickLength).toBe(5);
  });
});
