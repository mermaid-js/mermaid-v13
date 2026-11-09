/**
 * `@mermaid-js/diagram-agentflow`: the agentflow diagram plugin (spec #523). The lexer, parser,
 * model and AST are here, with `semanticModel` for tool builders (D465); the layout, renderer,
 * plugin export and manifest land with the other tickets of that spec.
 */
export {
  agentflowTokens,
  AgentflowTokenKind,
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
