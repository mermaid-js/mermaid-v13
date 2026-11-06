/**
 * `@mermaid-js/diagram-gitgraph`: the git graph plugin (spec #292). Imports `@mermaid-js/core`
 * subpaths only. T1 (#368): the lexer, gated token by token against v12's Langium lexer. T2
 * (#370): the parser, the model builder (v12's DB) and the AST; `parseGitGraph` is what the
 * layout (#371), the language facet (#372) and the plugin (#374) build on. T3 (#371): the
 * custom layout, `layoutGitGraph`. T4 (#373): the SVG renderer, `renderGitGraph`, and the plugin
 * object, `gitGraph` (registered by T5, #374).
 */
export {
  detectGitGraph,
  GITGRAPH_TRIVIA,
  GitGraphTokenKind,
  parseGitGraph,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { GitGraphParseOptions, GitGraphParseResult, GitGraphToken } from './parser/index.ts';
export type * from './model.ts';
// T3 (#371): the custom layout.
export { GIT_GEOMETRY, GIT_METRICS, layoutGitGraph } from './layout/index.ts';
export type * from './layout/types.ts';
export type { GitGeometry, GitLayoutContext, GitMetrics } from './layout/index.ts';
// T4 (#373): the renderer and the plugin object.
export { GIT_PAINT, renderGitGraph } from './render/index.ts';
export type { GitPaintVariable, GitPaintVariables, GitRenderContext } from './render/index.ts';
export { gitGraph } from './plugin.ts';
