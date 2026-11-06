/**
 * `@mermaid-js/diagram-gitgraph`: the git graph plugin (spec #292). Imports `@mermaid-js/core`
 * subpaths only. T1 (#368): the lexer, gated token by token against v12's Langium lexer; the
 * token kinds and trivia set are what the parser (#370) reads.
 */
export { GITGRAPH_TRIVIA, GitGraphTokenKind } from './parser/index.ts';
export type { GitGraphToken } from './parser/index.ts';
// T3 (#371): the custom layout.
export { GIT_GEOMETRY, GIT_METRICS, layoutGitGraph } from './layout/index.ts';
export type * from './layout/types.ts';
export type { GitGeometry, GitLayoutContext, GitMetrics } from './layout/index.ts';
