/**
 * `@mermaid-js/diagram-railroad/testing`: what the conformance gates read and a render never
 * does (as wardley's): v12's Langium token names per notation, the token streams and their
 * trivia set. They live outside the runtime entry, so the chunk mermaid loads for a railroad
 * render stays small (D217).
 */
export { LANGIUM_HIDDEN, LANGIUM_NAMES } from './parser/langium-names.ts';
export {
  LEXERS,
  RAILROAD_TRIVIA,
  RailroadTokenKind,
  railroadTokens,
  railroadView,
} from './parser/index.ts';
export type { RailroadNotation, RailroadToken, RailroadView } from './parser/index.ts';
