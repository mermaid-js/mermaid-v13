/**
 * Class diagram plugin (spec #126). Imports `@mermaid-js/core` only. So far: the lexer, gated
 * token by token against v12's `classDiagram.jison` (#153).
 */
export { ClassTokenKind, classTokens, JISON_NAMES, lexClass, tokenValue } from './parser/index.ts';
export type { ClassLex, ClassToken } from './parser/index.ts';
