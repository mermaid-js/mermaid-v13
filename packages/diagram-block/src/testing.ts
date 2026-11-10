/**
 * `@mermaid-js/diagram-block/testing`: what the conformance gates read and a render never does
 * (as venn's): the layout invariants, the grid as the layout measured it (for parity with v12's
 * own grid), the test context, and the text drawing with its grid and routes. It lives outside
 * the runtime entries, so the chunks mermaid loads for a block render stay small (D217).
 */
export { blockLayoutViolations } from './layout/invariants.ts';
export { gridPosition, placeGrid, sizeGrid, type GridNode } from './layout/grid.ts';
export { BLOCK_METRICS } from './layout/metrics.ts';
export { blockGrid, type BlockGridItem } from './layout/layout.ts';
export {
  blockTestConfig,
  blockTestContext,
  blockTestTheme,
  parsedBlock,
  TEST_VERSION,
  type ParsedBlock,
} from './test-context.ts';
export { drawBlockText } from './ascii/text.ts';
export type { TextBox } from './ascii/grid.ts';
export type { Route } from './ascii/route.ts';
