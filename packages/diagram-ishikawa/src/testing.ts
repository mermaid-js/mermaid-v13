/**
 * `@mermaid-js/diagram-ishikawa/testing`: what the conformance gates read and a render never does
 * (as venn's): the layout invariants and the test helpers. They live outside the runtime entry,
 * so the chunk mermaid loads for an ishikawa render stays small (D217).
 */
export { ishikawaLabelOverlaps, ishikawaLayoutViolations } from './layout/invariants.ts';
export {
  ishikawaTestConfig,
  ishikawaTestContext,
  ishikawaTestTheme,
  parsedIshikawa,
  type ParsedIshikawa,
} from './test-context.ts';
