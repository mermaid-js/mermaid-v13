import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/** v12's `radar` theme block (`theme-default.js:342-354`), the same in every theme that has one. */
const V12_RADAR = {
  values: { radarGraticuleColor: '#DEDEDE' },
  tokens: {
    radarAxisStrokeWidth: 2,
    radarAxisLabelFontSize: 12,
    radarCurveOpacity: 0.5,
    radarCurveStrokeWidth: 2,
    radarGraticuleOpacity: 0.3,
    radarGraticuleStrokeWidth: 1,
    // v12 declares it and draws a fixed 12 px swatch; v13 reads it (D359).
    radarLegendBoxSize: 12,
    radarLegendFontSize: 12,
  },
} as const;

/**
 * The radar chart's theme table (`DiagramPlugin.theme`, D322, D331): the variables of
 * `vocabulary.ts` under the `radar` section (D335). `radarAxisColor` is the rule `lineColor` in
 * every theme, so it follows an author's `lineColor` override (D351, D333(b)); it is a rule, not
 * `inline(lineColor)`, which would read only what the theme wrote. The other nine are v12's
 * literals, one entry for every family.
 */
export const theme: DiagramThemeTable = {
  section: 'radar',
  vars: THEME_VARIABLE_TABLE,
  rules: { light: { radarAxisColor: 'lineColor' } },
  families: { classic: V12_RADAR, redux: V12_RADAR, neo: V12_RADAR },
};
