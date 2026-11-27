import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: the XY chart reads them all. */
const XYCHART: readonly string[] = ['xychart'];

/** One colour row: its alias and v12's key under `themeVariables.xyChart`. */
const color = (alias: string, nested: string): DiagramThemeVarDef => ({
  alias,
  kind: 'color',
  usedBy: XYCHART,
  nested,
});

/**
 * The XY chart's theme variables (D322, D331, spec #426): v12's thirteen `xyChart.*` keys as
 * flat `xyChart*` variables, plus v13's `dataLabelOutsideColor` for labels drawn outside the bars
 * (D749), each with its key under the `xyChart` section (D335, D540:
 * `themeVariables.xyChart.titleColor` sets `xyChartTitleColor`, the flat name winning). The plot
 * palette is a `palette` (D545): a list of colours, set as an array or a comma-separated string.
 * They are not core's (R-PERF-8). `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  xyChartBackgroundColor: color('xyb', 'backgroundColor'),
  xyChartTitleColor: color('xyt', 'titleColor'),
  xyChartDataLabelColor: color('xyd', 'dataLabelColor'),
  xyChartDataLabelOutsideColor: color('xdo', 'dataLabelOutsideColor'),
  xyChartLegendTextColor: color('xyl', 'legendTextColor'),
  xyChartXAxisTitleColor: color('xat', 'xAxisTitleColor'),
  xyChartXAxisLabelColor: color('xal', 'xAxisLabelColor'),
  xyChartXAxisTickColor: color('xak', 'xAxisTickColor'),
  xyChartXAxisLineColor: color('xan', 'xAxisLineColor'),
  xyChartYAxisTitleColor: color('yat', 'yAxisTitleColor'),
  xyChartYAxisLabelColor: color('yal', 'yAxisLabelColor'),
  xyChartYAxisTickColor: color('yak', 'yAxisTickColor'),
  xyChartYAxisLineColor: color('yan', 'yAxisLineColor'),
  xyChartPlotColorPalette: {
    alias: 'xyp',
    kind: 'palette',
    usedBy: XYCHART,
    nested: 'plotColorPalette',
  },
};
