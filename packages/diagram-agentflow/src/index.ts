/**
 * `@mermaid-js/diagram-agentflow`: the agentflow diagram plugin (spec #523). The lexer is here;
 * the parser, model, layout, renderer, plugin export and manifest land with the other tickets
 * of that spec.
 */
export { agentflowTokens, AgentflowTokenKind, JISON_NAMES } from './parser/index.ts';
export type { AgentflowToken } from './parser/index.ts';
