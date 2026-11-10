/**
 * `@mermaid-js/diagram-agentflow`: the agentflow diagram plugin (spec #523). The lexer, parser,
 * model and AST are here, with `semanticModel` for tool builders (D465), the layout
 * (`layoutAgentflow`), the SVG renderer (`renderAgentflow`) and the plugin object (`agentflow`,
 * with its theme table and `configDefaults`), registered from the package's manifest (#550). The
 * language facet is on `./language`.
 */
export { agentflow } from './plugin.ts';
export { agentflowConfigDefaults } from './generated/config-defaults.ts';
export { agentflowLabels } from './labels.ts';
export { renderAgentflow } from './render/render.ts';
export type { AgentflowRenderContext, AgentflowRenderWarning } from './render/context.ts';
export {
  agentflowTokens,
  AgentflowTokenKind,
  detectAgentflow,
  JISON_NAMES,
  parseAgentflow,
} from './parser/index.ts';
export type * from './parser/index.ts';
export { semanticModel } from './semantic.ts';
export type {
  AgentflowSemanticModel,
  SemanticConnector,
  SemanticDiagnostic,
  SemanticEdge,
  SemanticSubGraph,
  SemanticVertex,
} from './semantic.ts';
export {
  AGENTFLOW_CONFIG_INVALID,
  layoutAgentflow,
  prepareAgentflow,
  shapeOutline,
} from './layout/index.ts';
export type {
  AgentflowEdgeView,
  AgentflowGroupView,
  AgentflowLayout,
  Arrowhead,
  CurveKind,
  ShapeGeometry,
  AgentflowLayoutContext,
  AgentflowNodeView,
  AgentflowPrepared,
  AgentflowWarning,
  LayoutShape,
} from './layout/index.ts';
