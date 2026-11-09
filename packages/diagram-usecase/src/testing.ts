/**
 * `@mermaid-js/diagram-usecase/testing`: what the conformance gates read and a render never
 * does (as wardley's, #487): v12's Chevrotain token names, the token stream and the text v12
 * lexed. They live outside the runtime entry, so the chunk mermaid loads for a usecase render
 * stays small (D217).
 */
export {
  CHEVROTAIN_NAMES,
  decodePlaceholders,
  lexText,
  UsecaseTokenKind,
  usecaseTokens,
  usecaseView,
} from './parser/index.ts';
export type { UsecaseToken, UsecaseView } from './parser/index.ts';
export { usecaseLayoutProblems } from './layout/invariants.ts';
