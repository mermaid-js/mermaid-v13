/**
 * State diagram plugin. Imports `@mermaid-js/core` only. T1 (#138): the lexer, gated token by
 * token against v12's `stateDiagram.jison`. T2 (#142): the parser, model and AST. T3 (#144):
 * the graph builder and layout. The renderer follows.
 */
export * from './parser/index.ts';
export * from './layout/index.ts';
