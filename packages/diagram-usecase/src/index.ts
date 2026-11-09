/**
 * `@mermaid-js/diagram-usecase`: the usecase diagram plugin (spec #517), in progress. A graph
 * type (`layoutKind: 'graph'`, laid out by `ctx.layout ?? layered`). This entry has the parser
 * (#563): `parseUsecase(text, { preprocessed })` gives the {@link UsecaseModel}, the AST,
 * diagnostics, symbols and statement spans. The layout and renderer land with T3 and T4, the
 * plugin object and manifest with T5. The lexer and its parity gate's helpers are in `./testing`.
 */
export { detectUsecase, parseUsecase } from './parser/index.ts';
export type { UsecaseParseOptions, UsecaseParseResult } from './parser/index.ts';
export type * from './parser/ast.ts';
export type * from './model.ts';
export * from './codes.ts';
