/**
 * `@mermaid-js/diagram-gitgraph/testing`: what the conformance gates read and a render never
 * does: v12's Langium token names, the token stream and its trivia set. They live outside the
 * runtime entry, which mermaid will load for every gitGraph render, so that chunk stays small
 * (D217).
 */
export {
  GITGRAPH_TRIVIA,
  GitGraphTokenKind,
  gitGraphTokens,
  LANGIUM_NAMES,
} from './parser/index.ts';
export type { GitGraphToken } from './parser/index.ts';
// T3 (#371): the layout invariants, for the corpus sweep.
export { gitLayoutViolations, type ViolationOptions } from './layout/invariants.ts';
