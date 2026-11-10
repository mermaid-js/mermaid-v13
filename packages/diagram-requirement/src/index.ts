/**
 * `@mermaid-js/diagram-requirement`: the requirement diagram plugin (spec #520). The lexer, the
 * parser, the model and AST, the layout's types, the codes of the warnings it raises and the
 * plugin are here; the layout and its marker metrics are on `./testing`. `mermaid` loads the
 * plugin through its generated registry (#587).
 */
export {
  detectRequirement,
  JISON_NAMES,
  parseRequirement,
  RequirementTokenKind,
  requirementTokens,
} from './parser/index.ts';
export type {
  ElementDefNode,
  RelationNode,
  RequirementDefNode,
  RequirementDocument,
  RequirementFieldNode,
  RequirementParseOptions,
  RequirementParseResult,
  RequirementSimpleKind,
  RequirementSimpleNode,
  RequirementStatementNode,
  RequirementText,
  RequirementToken,
} from './parser/index.ts';
export type * from './model.ts';
export type {
  BoxMeasures,
  BoxView,
  LinePart,
  LineView,
  RelationView,
  RequirementCurve,
  RequirementLayout,
  RequirementLayoutWarning,
  RequirementPrepared,
  RequirementRenderContext,
} from './layout/index.ts';
export {
  REQUIREMENT_DUPLICATE,
  REQUIREMENT_SHARED_NAME,
  REQUIREMENT_STYLE_DROPPED,
  REQUIREMENT_UNKNOWN_NODE,
} from './codes.ts';
export { requirement } from './plugin.ts';
