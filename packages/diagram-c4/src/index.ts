/**
 * `@mermaid-js/diagram-c4`: the C4 diagram plugin (spec #522): the parser, its model and AST,
 * the lexer, and the codes of the diagnostics it raises. The layout, renderer, plugin export and
 * manifest land with the other tickets of that spec.
 */
export { C4TokenKind, c4Tokens, detectC4, JISON_NAMES, parseC4 } from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export {
  C4_DIRECTION,
  C4_NAME_RESERVED,
  C4_NAMED_ARGUMENT_MOVED,
  C4_OFFSET_INVALID,
  C4_UNKNOWN_END,
} from './codes.ts';
