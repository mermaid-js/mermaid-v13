/**
 * `@mermaid-js/diagram-gitgraph`: the git graph plugin (spec #292). Imports `@mermaid-js/core`
 * subpaths only. T1 (#368): the lexer, gated token by token against v12's Langium lexer. T2
 * (#370): the parser, the model builder (v12's DB) and the AST; `parseGitGraph` is what the
 * layout (#371), the language facet (#372) and the plugin (#374) build on.
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
