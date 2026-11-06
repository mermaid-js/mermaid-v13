import type { DiagramParseContext, DiagramPlugin, RenderContext } from '@mermaid-js/core';
import type { SvgWriter } from '@mermaid-js/core/svg';
import { layoutRadar, type RadarLayout } from './layout/index.ts';
import type { RadarModel } from './model.ts';
import { detectRadar, parseRadar, type RadarParseResult } from './parser/index.ts';
import { radarLabels } from './labels.ts';
import { renderRadar } from './render/index.ts';

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
 * The radar chart plugin (DESIGN §12.1, spec #422): `layoutKind: 'custom'` with its own
 * `RadarLayout`. `parse` takes the whole source; `layout` measures and places everything on
 * v12's canvas; `render` writes the whole `<svg>` document. SVG only (D320).
 *
 * `theme` is radar's own table (D322, D331): v12's ten `radar.*` style keys as flat `radar*`
 * variables under the `radar` section (D335: `themeVariables.radar.axisColor` sets
 * `radarAxisColor`, the flat name winning, D540). `radarAxisColor` is the rule `lineColor` in
 * every theme (D351, D333(b)); the other nine are v12's literals, one entry for every family.
 * The manifest and the generated `configDefaults` come with #449.
 */
export const radar = {
  id: 'radar',
  formats: ['svg'] as const,
  layoutKind: 'custom' as const,
  detector: (text: string): boolean => detectRadar(text),
  parse: (text: string, ctx: DiagramParseContext): RadarParseResult =>
    parseRadar(text, { preprocessed: ctx.preprocessed }),
  labels: radarLabels,
  layout: (model: RadarModel, ctx: RenderContext): RadarLayout => layoutRadar(model, ctx),
  render: (model: RadarModel, layout: RadarLayout, ctx: RenderContext, w: SvgWriter): void =>
    renderRadar(model, layout, ctx, w),
  theme: {
    section: 'radar',
    vars: {
      radarAxisColor: { alias: 'rda', kind: 'color', nested: 'axisColor' },
      radarAxisStrokeWidth: { alias: 'raw', kind: 'length', nested: 'axisStrokeWidth' },
      radarAxisLabelFontSize: { alias: 'ral', kind: 'length', nested: 'axisLabelFontSize' },
      radarCurveOpacity: { alias: 'rco', kind: 'opacity', nested: 'curveOpacity' },
      radarCurveStrokeWidth: { alias: 'rcw', kind: 'length', nested: 'curveStrokeWidth' },
      radarGraticuleColor: { alias: 'rgc', kind: 'color', nested: 'graticuleColor' },
      radarGraticuleOpacity: { alias: 'rgo', kind: 'opacity', nested: 'graticuleOpacity' },
      radarGraticuleStrokeWidth: { alias: 'rgw', kind: 'length', nested: 'graticuleStrokeWidth' },
      radarLegendBoxSize: { alias: 'rlb', kind: 'length', nested: 'legendBoxSize' },
      radarLegendFontSize: { alias: 'rlf', kind: 'length', nested: 'legendFontSize' },
    },
    rules: { light: { radarAxisColor: 'lineColor' } },
    families: { classic: V12_RADAR, redux: V12_RADAR, neo: V12_RADAR },
  },
} satisfies DiagramPlugin<RadarModel, RadarLayout>;
