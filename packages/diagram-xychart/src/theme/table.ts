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
 * too, where v12's redux and `neo` themes left it unset (D333(b)), except in their dark themes:
 * there the light text vanishes on the light bars, so the labels take v12's dark ink `#131300`
 * unless the text reads on the first bar colour (D749, amending D333(b)). Labels drawn outside
 * the bars (`showDataLabelOutsideBar`) sit on the canvas, so they read their own
 * `xyChartDataLabelOutsideColor`: an author's `dataLabelColor` when set, as v12 drew it, else the
 * canvas text (D749). The plot palette reads
 * the shared chart series palette `plotColorArray` (D381, D545), which every theme spec fills
 * with v12's `plotColorPalette`.
 */
/** Labels inside a bar: the canvas text where it reads on the first bar colour, else v12's ink. */
const DARK_INK = 'contrast(plotColorArray0, canvasTextColor, #131300)';

export const theme: DiagramThemeTable = {
  section: XYCHART_SECTION,
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      xyChartBackgroundColor: 'canvasBkg',
      xyChartTitleColor: 'canvasTextColor',
      xyChartDataLabelColor: 'canvasTextColor',
      xyChartDataLabelOutsideColor: 'ifSet(xyChartDataLabelColor, canvasTextColor)',
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
  families: {
    // The dark redux and neo themes draw light text on a light palette. v12 drew theme-default's
    // #131300 there, AA on every slot of their palette (D749).
    redux: { dark: { rules: { xyChartDataLabelColor: DARK_INK } } },
    neo: { dark: { rules: { xyChartDataLabelColor: DARK_INK } } },
  },
};
