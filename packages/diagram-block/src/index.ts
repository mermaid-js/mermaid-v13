/**
 * `@mermaid-js/diagram-block`: the block diagram plugin (spec #521). The lexer is here; the
 * parser, model, layout, renderer, plugin export (`layoutKind: 'custom'`) and manifest land
 * with the other tickets of that spec.
 */
export { BlockTokenKind, blockTokens, JISON_NAMES } from './parser/index.ts';
export type { BlockToken } from './parser/index.ts';
