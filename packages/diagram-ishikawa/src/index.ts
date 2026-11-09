/**
 * `@mermaid-js/diagram-ishikawa`: the ishikawa (fishbone) diagram plugin (spec #519): the
 * parser, its model and AST, detection, the lexer, the codes of the warnings it raises, and the
 * fishbone layout. The renderer, plugin export and manifest land with the other tickets of that
 * spec.
 */
export {
  detectIshikawa,
  ishikawaTokens,
  IshikawaTokenKind,
  JISON_NAMES,
  parseIshikawa,
} from './parser/index.ts';
export type * from './parser/index.ts';
export type * from './model.ts';
export { ISHIKAWA_EMPTY, ISHIKAWA_INDENT_CLAMPED } from './codes.ts';
export { layoutIshikawa } from './layout/index.ts';
export type * from './layout/index.ts';
