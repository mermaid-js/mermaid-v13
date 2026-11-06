/**
 * `@mermaid-js/diagram-cynefin/testing`: what the conformance gates read and a render never
 * does: v12's Langium token names, the token stream and its trivia set (#461). They live
 * outside the runtime entry, which mermaid loads for every cynefin render, so that chunk stays
 * small (D217).
 */
export { CYNEFIN_TRIVIA, CynefinTokenKind, cynefinTokens, LANGIUM_NAMES } from './parser/index.ts';
export type { CynefinToken } from './parser/index.ts';
