/**
 * State diagram plugin. Imports `@mermaid-js/core` only. T1 (#138): the lexer, gated token by
 * token against v12's `stateDiagram.jison`. T2 (#142): the parser, model and AST. The layout
 * and renderer follow.
 */
export * from './parser/index.ts';
