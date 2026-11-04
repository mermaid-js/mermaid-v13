/**
 * State diagram plugin. Imports `@mermaid-js/core` only. T1 (#138): the lexer, gated token by
 * token against v12's `stateDiagram.jison`; the parser, model and renderer follow.
 */
export { JISON_NAMES, stateTokens, StateTokenKind } from './parser/index.ts';
export type { StateToken } from './parser/index.ts';
