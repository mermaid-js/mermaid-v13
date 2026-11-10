/**
 * `@mermaid-js/diagram-block`: the block diagram plugin (spec #521): the lexer, the parser with
 * its model and AST, the codes of the warnings it raises, the layout and its shape geometry, the
 * SVG renderer (#556), and the plugin object (`layoutKind: 'custom'`), which the registry loads
 * from the package's `mermaid` manifest (#558).
 */
export {
  BlockTokenKind,
  blockTokens,
  detectBlock,
  JISON_NAMES,
  MAX_SPACE_CELLS,
  MAX_SPAN,
  parseBlock,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export { BLOCK_SIZE_INVALID, BLOCK_STYLE_UNKNOWN, BLOCK_TRUNCATED } from './codes.ts';
export { block } from './plugin.ts';
export { renderBlock, type BlockRenderContext } from './render/index.ts';
export { blockPadding, layoutBlock, type BlockLayoutContext } from './layout/index.ts';
export type * from './layout/types.ts';
export type { LeafShape } from './shapes/leaf.ts';
