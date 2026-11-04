/**
 * Class diagram plugin (spec #126). Imports `@mermaid-js/core` only. So far: the lexer, gated
 * token by token against v12's `classDiagram.jison` (#153), and the parser, `ClassModel` and
 * AST, at oracle parity with v12 (#154).
 */
export * from './parser/index.ts';
// Generated from grammar/class.ebnf (D93, D94), for the language facet (#159).
export { classCategories } from './generated/categories.ts';
export { classDocs } from './generated/docs.ts';
// Layout (#155): measures every box and lays the graph out with `ctx.layout` (D106).
export * from './layout/index.ts';
// Renderer (#156): the whole `<svg>` through the SvgWriter, and the plugin (registered in #157).
export { renderClass } from './render/render.ts';
export type { ClassRenderContext, ClassWarning } from './render/context.ts';
export { classDiagram } from './plugin.ts';
