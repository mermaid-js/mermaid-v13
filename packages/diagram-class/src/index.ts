/**
 * Class diagram plugin (spec #126). Imports `@mermaid-js/core` only. So far: the lexer, gated
 * token by token against v12's `classDiagram.jison` (#153), and the parser, `ClassModel` and
 * AST, at oracle parity with v12 (#154).
 */
export * from './parser/index.ts';
