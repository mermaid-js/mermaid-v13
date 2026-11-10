/**
 * Test-only entry (`@mermaid-js/diagram-agentflow/testing`): the layout checks the package's
 * specs and the parser-produced corpus spec in conformance share, and the renderer's harness
 * (the plugin's parse → layout → render seam with the pipeline's render context).
 */
export { agentflowLayoutProblems } from './layout/invariants.ts';
export { renderAgentflowForTest, TEST_VERSION } from './render/harness.ts';
export type { RenderAgentflowOptions, RenderedAgentflow } from './render/harness.ts';
