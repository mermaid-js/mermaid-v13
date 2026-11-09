/**
 * `@mermaid-js/diagram-ishikawa/testing`: what the conformance gates read and a render never does
 * (as venn's): the layout invariants, the layout with v12's overlaps kept (for the v12 parity
 * spec), the render harness and the test helpers. They live outside the runtime entry,
 * so the chunk mermaid loads for an ishikawa render stays small (D217).
 */
export { ishikawaLabelOverlaps, ishikawaLayoutViolations } from './layout/invariants.ts';
export { layoutIshikawaUnfixed } from './layout/layout.ts';
export {
  ishikawaTestConfig,
  ishikawaTestContext,
  ishikawaTestTheme,
  parsedIshikawa,
  type ParsedIshikawa,
} from './test-context.ts';
export { renderIshikawaForTest } from './render/harness.ts';
export type { RenderedIshikawa, RenderIshikawaOptions } from './render/harness.ts';
