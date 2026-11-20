import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';
import { XYCHART_SECTION } from '../config.ts';

/**
 * The XY chart's theme table (`DiagramPlugin.theme`, D322, D331, spec #426 §Theme): the
 * variables of `vocabulary.ts` under the `xyChart` section (D335). One set of rules for every
 * family, light and dark, as v12's `xyChart` blocks derive them in every theme: the eleven text
 * and axis colours are `canvasTextColor`, the background is `canvasBkg`. Those canvas inputs are
 * `primaryTextColor` and `background`, except where a theme pins them because v12 kept its block
 * under an override of the two (`default`, D656, which replaces D388); an author's
 * `canvasTextColor` or `canvasBkg` still moves them. `xyChartDataLabelColor` is the text colour
 * too, where v12's redux and `neo` themes left it unset (D333(b)). The plot palette reads the
 * shared chart series palette `plotColorArray` (D381, D545), which every theme spec fills with
 * v12's `plotColorPalette`.
 */
export const theme: DiagramThemeTable = {
  section: XYCHART_SECTION,
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      xyChartBackgroundColor: 'canvasBkg',
      xyChartTitleColor: 'canvasTextColor',
      xyChartDataLabelColor: 'canvasTextColor',
      xyChartLegendTextColor: 'canvasTextColor',
      xyChartXAxisTitleColor: 'canvasTextColor',
      xyChartXAxisLabelColor: 'canvasTextColor',
      xyChartXAxisTickColor: 'canvasTextColor',
      xyChartXAxisLineColor: 'canvasTextColor',
      xyChartYAxisTitleColor: 'canvasTextColor',
      xyChartYAxisLabelColor: 'canvasTextColor',
      xyChartYAxisTickColor: 'canvasTextColor',
      xyChartYAxisLineColor: 'canvasTextColor',
      xyChartPlotColorPalette: 'plotColorArray',
    },
  },
};
