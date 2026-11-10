/**
 * `@mermaid-js/diagram-architecture/testing`: what the conformance gates read and a render never
 * does (as wardley's, #487): v12's Langium token names, the token stream and its trivia set,
 * and the layout invariants the corpus specs check (#607). They live outside the runtime entry,
 * so the chunk mermaid loads for an architecture render stays small (D217).
 */
export {
  ARCHITECTURE_TRIVIA,
  ArchitectureTokenKind,
  architectureTokens,
  LANGIUM_NAMES,
} from './parser/index.ts';
export type { ArchitectureToken } from './parser/index.ts';
export {
  architectureLayoutProblems,
  facingInLine,
  layoutBytes,
  OPPOSITE_SIDE,
  portLines,
} from './layout/invariants.ts';
