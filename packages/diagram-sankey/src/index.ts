/**
 * `@mermaid-js/diagram-sankey`: the sankey diagram plugin (spec #427). The plugin (`sankey`), its
 * parser, model and AST, the codes of the diagnostics and warnings it raises, the layout and the
 * SVG renderer are here; the manifest and config defaults land with T5 (#503). The lexer and the
 * render harness, which only the tests read, are at `./testing` (as pie's, #325).
 */
export { sankey } from './plugin.ts';
export { renderSankey, type SankeyRenderContext } from './render/render.ts';
export {
  sankeyRenderOptions,
  type SankeyLinkPaint,
  type SankeyRenderOptions,
} from './render/options.ts';
export { detectSankey, parseSankey } from './parser/index.ts';
export type {
  SankeyDocument,
  SankeyField,
  SankeyLinkNode,
  SankeyNodeNode,
  SankeyParseOptions,
  SankeyParseResult,
} from './parser/index.ts';
export type * from './model.ts';
export { layoutSankey } from './layout/index.ts';
export type {
  SankeyAlignment,
  SankeyLabel,
  SankeyLabelStyle,
  SankeyLayout,
  SankeyLayoutContext,
  SankeyLinkLayout,
  SankeyLinkPath,
  SankeyNodeLayout,
} from './layout/index.ts';
export { sankeyLayoutConfig, type SankeyLayoutConfig } from './config.ts';
export { SANKEY_CYCLE, SANKEY_INVALID_VALUE, SANKEY_VALUE_TRAILING_TEXT } from './codes.ts';
