/**
 * `@mermaid-js/diagram-block`: the block diagram plugin (spec #521): the lexer, the parser with
 * its model and AST, and the codes of the warnings it raises. The layout, renderer, plugin
 * export (`layoutKind: 'custom'`) and manifest land with the other tickets of that spec.
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
