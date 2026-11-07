/**
 * `@mermaid-js/diagram-info/testing`: what the conformance gates read and a render never does:
 * v12's Langium token names, the token stream and its trivia set. They live outside the
 * runtime entry, which mermaid loads for every info render, so that chunk stays small (D217).
 */
export { INFO_TRIVIA, InfoTokenKind, infoTokens, LANGIUM_NAMES } from './parser/index.ts';
