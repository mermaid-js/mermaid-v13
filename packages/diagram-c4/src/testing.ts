/**
 * `@mermaid-js/diagram-c4/testing`: what the conformance gates read and a render never does: the
 * layout invariants and the test helpers. They live outside the runtime entry, so the chunk
 * mermaid loads for a C4 render stays small (D217).
 */
export { c4LayoutViolations, c4RelationCrossings } from './layout/invariants.ts';
export { c4TestConfig, c4TestContext, parsedC4, type ParsedC4 } from './test-context.ts';
