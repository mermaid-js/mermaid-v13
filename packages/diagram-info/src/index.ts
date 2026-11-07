/**
 * `@mermaid-js/diagram-info`: the info diagram plugin (#420), which prints the version of the
 * `mermaid` package that renders it. Imports `@mermaid-js/core` subpaths only. The lexer is
 * gated token by token against v12's Langium lexer; the token stream, which only the
 * conformance gates read, is at `./testing`, and text output at `./ascii`.
 */
export { info } from './plugin.ts';
export { renderInfo } from './render.ts';
export type { InfoRenderContext } from './render.ts';
export { detectInfo, parseInfo } from './parser/index.ts';
export type * from './parser/index.ts';
export type { InfoModel } from './model.ts';
export { INFO_METRICS, layoutInfo } from './layout.ts';
export type { InfoLayout, InfoLayoutContext } from './layout.ts';
