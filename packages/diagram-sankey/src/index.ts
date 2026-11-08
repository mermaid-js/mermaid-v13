/**
 * `@mermaid-js/diagram-sankey`: the sankey diagram plugin (spec #427). The parser, its model and
 * AST, the codes of the diagnostics and warnings it raises, and the layout are here; the
 * renderer, plugin export and manifest land with the other tickets of that spec. The lexer, which only
 * the conformance gates read, is at `./testing` (as pie's, #325).
 */
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
