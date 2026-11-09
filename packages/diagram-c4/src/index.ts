/**
 * `@mermaid-js/diagram-c4`: the C4 diagram plugin (spec #522). The lexer is here; the parser,
 * model, layout, renderer, plugin export and manifest land with the other tickets of that
 * spec.
 */
export { C4TokenKind, c4Tokens, JISON_NAMES } from './parser/index.ts';
export type { C4Token } from './parser/index.ts';
