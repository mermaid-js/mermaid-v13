/**
 * `@mermaid-js/diagram-radar/testing`: what the conformance gates read and a render never does
 * (as pie's, #325): v12's Langium token names, the token stream and its trivia set, and the layout
 * invariants. They live outside the runtime entry, so the chunk mermaid loads for a radar render
 * stays small (D217).
 */
export { radarLayoutViolations } from './layout/invariants.ts';
export { LANGIUM_NAMES, RADAR_TRIVIA, RadarTokenKind, radarTokens } from './parser/index.ts';
export type { RadarToken } from './parser/index.ts';
export { radarTestContext, radarTestTheme, type RadarTestContext } from './test-context.ts';
