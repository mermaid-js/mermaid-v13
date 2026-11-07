import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: radar reads them all. */
const RADAR: readonly string[] = ['radar'];

/**
 * The radar chart's theme variables (D322, D331, spec #422): v12's ten `radar.*` style keys as
 * flat `radar*` variables, each with its key under the `radar` section (D335, D540:
 * `themeVariables.radar.axisColor` sets `radarAxisColor`, the flat name winning). They are not
 * core's (R-PERF-8). `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  radarAxisColor: { alias: 'rda', kind: 'color', usedBy: RADAR, nested: 'axisColor' },
  radarAxisStrokeWidth: {
    alias: 'raw',
    kind: 'length',
    usedBy: RADAR,
    nested: 'axisStrokeWidth',
  },
  radarAxisLabelFontSize: {
    alias: 'ral',
    kind: 'length',
    usedBy: RADAR,
    nested: 'axisLabelFontSize',
  },
  radarCurveOpacity: { alias: 'rco', kind: 'opacity', usedBy: RADAR, nested: 'curveOpacity' },
  radarCurveStrokeWidth: {
    alias: 'rcw',
    kind: 'length',
    usedBy: RADAR,
    nested: 'curveStrokeWidth',
  },
  radarGraticuleColor: { alias: 'rgc', kind: 'color', usedBy: RADAR, nested: 'graticuleColor' },
  radarGraticuleOpacity: {
    alias: 'rgo',
    kind: 'opacity',
    usedBy: RADAR,
    nested: 'graticuleOpacity',
  },
  radarGraticuleStrokeWidth: {
    alias: 'rgw',
    kind: 'length',
    usedBy: RADAR,
    nested: 'graticuleStrokeWidth',
  },
  radarLegendBoxSize: { alias: 'rlb', kind: 'length', usedBy: RADAR, nested: 'legendBoxSize' },
  radarLegendFontSize: { alias: 'rlf', kind: 'length', usedBy: RADAR, nested: 'legendFontSize' },
};
