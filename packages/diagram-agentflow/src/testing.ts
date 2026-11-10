/**
 * Test-only entry (`@mermaid-js/diagram-agentflow/testing`): the layout checks the package's
 * specs and the parser-produced corpus spec in conformance share, the plugin's parse path as the
 * pipeline runs it (`parseAgentflowForTest`), and the renderer's harness (the plugin's parse →
 * layout → render seam with the pipeline's render context).
 */
export { agentflowLayoutProblems } from './layout/invariants.ts';
export { parseAgentflowForTest, renderAgentflowForTest, TEST_VERSION } from './render/harness.ts';
export type {
  ParseAgentflowOptions,
  ParsedAgentflow,
  RenderAgentflowOptions,
  RenderedAgentflow,
} from './render/harness.ts';
