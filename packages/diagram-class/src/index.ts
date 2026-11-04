/**
 * Class diagram plugin (spec #126). Imports `@mermaid-js/core` only: the lexer, gated token by
 * token against v12's `classDiagram.jison` (#153), the parser, `ClassModel` and AST at oracle
 * parity with v12 (#154), the layout (#155), the renderer (#156) and the plugin (#157).
 */
export * from './parser/index.ts';
// The token categories and keyword docs (generated from grammar/class.ebnf, D93, D94) are
// exported from `./language` only, so the renderer's bundle does not carry them (R-LANG-8).
// Layout (#155): measures every box and lays the graph out with `ctx.layout` (D106).
export * from './layout/index.ts';
// Renderer (#156): the whole `<svg>` through the SvgWriter, and the plugin (registered in #157).
export { renderClass } from './render/render.ts';
export type { ClassRenderContext, ClassWarning } from './render/context.ts';
export { classDiagram } from './plugin.ts';
