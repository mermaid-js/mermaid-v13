/**
 * `@mermaid-js/diagram-c4/testing`: what the conformance gates read and a render never does: the
 * layout invariants and the test helpers. They live outside the runtime entry, so the chunk
 * mermaid loads for a C4 render stays small (D217).
 */
export { c4LayoutViolations } from './layout/invariants.ts';
export { c4CellRect, drawC4 as c4AsciiDrawing, type C4Drawing } from './ascii/draw.ts';
export { c4TestContext, parsedC4, type ParsedC4 } from './test-context.ts';
export { renderC4ForTest, type RenderC4Options, type RenderedC4 } from './render/harness.ts';
// The c4-beta parser, reachable from specs only until its detection and plugin land (spec #730).
export { parseC4Beta, lexC4Beta, C4BetaTokenKind } from './beta/index.ts';
export type * from './beta/index.ts';
