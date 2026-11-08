/**
 * `@mermaid-js/diagram-treemap/testing`: what the conformance gates read and a render never
 * does (as pie's and radar's): v12's Langium token names, the token stream and its trivia set.
 * They live outside the runtime entry, so the chunk mermaid loads for a treemap render stays
 * small (D217).
 */
export { LANGIUM_NAMES, TREEMAP_TRIVIA, TreemapTokenKind, treemapTokens } from './parser/index.ts';
export type { TreemapToken } from './parser/index.ts';
