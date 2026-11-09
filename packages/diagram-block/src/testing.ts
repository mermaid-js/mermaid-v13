/**
 * `@mermaid-js/diagram-block/testing`: what the conformance gates read and a render never does
 * (as venn's): the layout invariants, the grid as the layout measured it (for parity with v12's
 * own grid), and the test context. It lives outside the runtime entry, so the chunk mermaid
 * loads for a block render stays small (D217).
 */
export { blockLayoutViolations } from './layout/invariants.ts';
export { blockGrid, type BlockGridItem } from './layout/layout.ts';
export {
  blockTestConfig,
  blockTestContext,
  blockTestTheme,
  parsedBlock,
  type ParsedBlock,
} from './test-context.ts';
