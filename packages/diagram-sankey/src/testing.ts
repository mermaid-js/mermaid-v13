/**
 * `@mermaid-js/diagram-sankey/testing`: what the conformance gates read and a render never does
 * (as pie's, #325): v12's jison terminal names, the token stream, the layout invariants, the
 * test context and the render harness (the plugin's own seam until T5's manifest, #503). They
 * live outside the runtime entry, so the chunk mermaid loads for every sankey render stays
 * small (D217).
 */
export { JISON_NAMES, SankeyTokenKind, sankeyTokens } from './parser/index.ts';
export type { SankeyToken } from './parser/index.ts';
export { sankeyLayoutViolations } from './layout/index.ts';
export { sankeyTestContext, sankeyTestTheme } from './test-context.ts';
export { renderSankeyForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedSankey, RenderSankeyOptions } from './render/harness.ts';
