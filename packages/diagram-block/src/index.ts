/**
 * `@mermaid-js/diagram-block`: the block diagram plugin (spec #521): the lexer, the parser with
 * its model and AST, the codes of the warnings it raises, the layout and its shape geometry, and
 * the plugin object so far (`layoutKind: 'custom'`, no renderer yet). The renderer and the
 * manifest land with #556 and #558.
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
export { blockPadding, layoutBlock, type BlockLayoutContext } from './layout/index.ts';
export type * from './layout/types.ts';
export type { LeafShape } from './shapes/leaf.ts';
