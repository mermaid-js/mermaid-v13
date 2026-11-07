/**
 * Test-only entry (`@mermaid-js/diagram-mindmap/testing`): the layout checks the package's specs
 * and the parser-produced corpus spec in conformance share, and the renderer's harness.
 */
export { mindmapProblems, treeProblems } from './layout/invariants.ts';
export { renderMindmapForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderedMindmap, RenderMindmapOptions } from './render/harness.ts';
