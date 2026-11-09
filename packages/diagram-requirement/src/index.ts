/**
 * `@mermaid-js/diagram-requirement`: the requirement diagram plugin (spec #520). The lexer, the
 * parser, the model and AST, the codes of the warnings it raises and the layout are here; the
 * renderer, plugin export and manifest land with the other tickets of that spec.
 */
export {
  detectRequirement,
  JISON_NAMES,
  parseRequirement,
  RequirementBuilder,
  RequirementTokenKind,
  requirementTokens,
  requirementView,
} from './parser/index.ts';
export type {
  At,
  BuilderOptions,
  DefAt,
  ElementDefNode,
  ElementFields,
  Ref,
  RelationNode,
  RequirementDefNode,
  RequirementDocument,
  RequirementFieldNode,
  RequirementFields,
  RequirementParseOptions,
  RequirementParseResult,
  RequirementSimpleKind,
  RequirementSimpleNode,
  RequirementStatementNode,
  RequirementText,
  RequirementToken,
} from './parser/index.ts';
export type * from './model.ts';
export { checkStyleCopies } from './limits.ts';
export {
  layoutRequirement,
  MARKER_ROOM,
  markerExtent,
  prepareRequirement,
  REQUIREMENT_METRICS,
  requirementCurve,
} from './layout/index.ts';
export type {
  BoxMeasures,
  BoxOf,
  BoxView,
  LinePart,
  LineView,
  MarkerExtent,
  RelationView,
  RequirementCurve,
  RequirementLayout,
  RequirementLayoutWarning,
  RequirementPrepared,
  RequirementRenderContext,
} from './layout/index.ts';
export {
  MAX_STYLE_COPIES,
  REQUIREMENT_DUPLICATE,
  REQUIREMENT_SHARED_NAME,
  REQUIREMENT_STYLE_DROPPED,
  REQUIREMENT_UNKNOWN_NODE,
} from './codes.ts';
