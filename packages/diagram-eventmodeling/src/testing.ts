/**
 * `@mermaid-js/diagram-eventmodeling/testing`: what the conformance gates read and a render never
 * does (as treemap's and wardley's): v12's Langium token names, the token stream and its trivia
 * set, the layout invariants and the layout test context. They live outside the runtime entry, so the chunk mermaid loads for an event model render
 * stays small (D217).
 */
export {
  EVENTMODELING_TRIVIA,
  EventModelingTokenKind,
  eventModelingTokens,
  eventModelingView,
  LANGIUM_NAMES,
} from './parser/index.ts';
export type { EventModelingToken, EventModelingView } from './parser/index.ts';
export { eventModelLayoutViolations } from './layout/invariants.ts';
export { eventModelTestContext, eventModelTestTheme } from './test-context.ts';
