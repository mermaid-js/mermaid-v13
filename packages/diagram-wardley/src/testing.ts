/**
 * `@mermaid-js/diagram-wardley/testing`: what the conformance gates read and a render never does
 * (as radar's, #445): v12's Langium token names, the token stream and its trivia set. They live
 * outside the runtime entry, so the chunk mermaid loads for a wardley render stays small (D217).
 */
export {
  LANGIUM_NAMES,
  WARDLEY_TRIVIA,
  WardleyTokenKind,
  wardleyTokens,
  wardleyView,
} from './parser/index.ts';
export type { WardleyToken, WardleyView } from './parser/index.ts';
