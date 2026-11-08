/**
 * `@mermaid-js/diagram-venn/testing`: what the conformance gates read and a render never does
 * (as radar's): the layout invariants, the test helpers, and the solver's fixed-seed generator,
 * for parity with venn.js on four sets or more. They live outside the runtime entry, so the
 * chunk mermaid loads for a venn render stays small (D217).
 */
export { vennLayoutViolations } from './layout/invariants.ts';
export { parsedVenn, vennTestContext, vennTestTheme, type ParsedVenn } from './test-context.ts';
export { seededRandom } from './solver/index.ts';
export { renderVennForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedVenn, RenderVennOptions } from './render/harness.ts';
