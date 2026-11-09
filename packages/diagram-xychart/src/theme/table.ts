import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import { XYCHART_SECTION } from '../config.ts';

/**
 * The XY chart's theme table (`DiagramPlugin.theme`, D322, D331, spec #426 §Theme): the
 * variables of `vocabulary.ts` under the `xyChart` section (D335). One set of rules for every
 * family, light and dark, as v12's `xyChart` blocks derive them in every theme: the eleven text
 * and axis colours are `primaryTextColor`, the background is `background`. Rules, not
 * `inline()`, so an author's `primaryTextColor` or `background` moves them in every theme,
 * `default` included (D388). `xyChartDataLabelColor` is `primaryTextColor` too, where v12's
 * redux and `neo` themes left it unset (D333(b)). The plot palette reads the shared chart
 * series palette `plotColorArray` (D381, D545), which every theme spec fills with v12's
 * `plotColorPalette`.
 */
export const theme: DiagramThemeTable = {
  section: XYCHART_SECTION,
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      xyChartBackgroundColor: 'background',
      xyChartTitleColor: 'primaryTextColor',
      xyChartDataLabelColor: 'primaryTextColor',
      xyChartLegendTextColor: 'primaryTextColor',
      xyChartXAxisTitleColor: 'primaryTextColor',
      xyChartXAxisLabelColor: 'primaryTextColor',
      xyChartXAxisTickColor: 'primaryTextColor',
      xyChartXAxisLineColor: 'primaryTextColor',
      xyChartYAxisTitleColor: 'primaryTextColor',
      xyChartYAxisLabelColor: 'primaryTextColor',
      xyChartYAxisTickColor: 'primaryTextColor',
      xyChartYAxisLineColor: 'primaryTextColor',
      xyChartPlotColorPalette: 'plotColorArray',
    },
  },
};
