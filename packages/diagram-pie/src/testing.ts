/**
 * `@mermaid-js/diagram-pie/testing`: what the conformance gates read and a render never does
 * (#325): v12's Langium token names, the token stream, its trivia set and the layout
 * invariants. They live outside the runtime entry, which mermaid loads for every pie render, so
 * that chunk stays small (D217).
 */
export { LANGIUM_NAMES, PIE_TRIVIA, PieTokenKind, pieTokens } from './parser/index.ts';
export { pieLayoutViolations } from './layout/index.ts';
