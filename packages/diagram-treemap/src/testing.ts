/**
 * `@mermaid-js/diagram-treemap/testing`: what the conformance gates read and the runtime entry
 * does not export (as pie's and radar's): v12's Langium token names, the token stream and its
 * trivia set, the layout invariants, `classStyles` (for the v12 parity snapshot's `styles`) and
 * the test context. They live outside the runtime entry, so the chunk mermaid loads for a
 * treemap render stays small (D217).
 */
export { LANGIUM_NAMES, TREEMAP_TRIVIA, TreemapTokenKind, treemapTokens } from './parser/index.ts';
export type { TreemapToken } from './parser/index.ts';
export { treemapLayoutViolations } from './layout/index.ts';
export { classStyles } from './model.ts';
export { treemapTestContext, treemapTestTheme } from './test-context.ts';
