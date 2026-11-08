/**
 * `@mermaid-js/diagram-sankey/testing`: what the conformance gates read and a render never does
 * (as pie's, #325): v12's jison terminal names and the token stream. They live outside the
 * runtime entry, so the chunk mermaid loads for every sankey render stays small (D217).
 */
export { JISON_NAMES, SankeyTokenKind, sankeyTokens } from './parser/index.ts';
export type { SankeyToken } from './parser/index.ts';
