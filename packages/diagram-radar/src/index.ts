/**
 * `@mermaid-js/diagram-radar` (spec #422): the radar chart plugin, in progress. T2 (#446): the
 * parser, detection, the model and the AST. T3 (#447): the layout, exported for the
 * conformance gates. T4 (#448): the SVG renderer and the plugin object with radar's theme
 * table. The token stream and the layout invariants, which only the conformance gates read, are
 * at `./testing`.
 */
export { radar } from './plugin.ts';
export { renderRadar } from './render/index.ts';
export type { RadarRenderContext } from './render/index.ts';
export {
  detectRadar,
  parseRadar,
  RADAR_MISSING_ENTRY,
  RADAR_NO_AXES,
  RADAR_TICKS_CLAMPED,
  RADAR_UNKNOWN_AXIS,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { RadarParseOptions, RadarParseResult } from './parser/index.ts';
export type { RadarAxis, RadarCurve, RadarEntry, RadarModel, RadarOptions } from './model.ts';
export { layoutRadar } from './layout/index.ts';
export type { RadarLayout, RadarLayoutContext } from './layout/index.ts';
