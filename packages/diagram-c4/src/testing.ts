/**
 * `@mermaid-js/diagram-c4/testing`: what the conformance gates read and a render never does: the
 * layout invariants and the test helpers. They live outside the runtime entry, so the chunk
 * mermaid loads for a C4 render stays small (D217).
 */
export { c4LayoutViolations, legendViolations } from './layout/invariants.ts';
export { c4CellRect, drawC4 as c4AsciiDrawing, type C4Drawing } from './ascii/draw.ts';
export {
  c4TestConfig,
  c4TestContext,
  c4TestTheme,
  parsedC4,
  type ParsedC4,
} from './test-context.ts';
export {
  renderC4BetaForTest,
  renderC4ForTest,
  type RenderC4Options,
  type RenderedC4,
  type RenderedC4Beta,
} from './render/harness.ts';
// The c4-beta parser, layout and detection, for specs (spec #730).
export { detectC4Beta } from './beta/detect.ts';
export { parseC4Beta, lexC4Beta, C4BetaTokenKind } from './beta/index.ts';
export { layoutC4Beta, layoutC4BetaFull } from './beta/layout.ts';
export type { C4BetaLaidOut, C4BetaLayoutContext } from './beta/layout.ts';
export type { C4BetaPrepared } from './beta/prepare.ts';
export type * from './beta/index.ts';
