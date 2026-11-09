/**
 * `@mermaid-js/diagram-requirement`: the requirement diagram plugin (spec #520). The lexer, the
 * parser, the model and AST, the codes of the warnings it raises, the layout, the renderer and
 * the plugin are here; the manifest and config defaults land with T5 (#587).
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
  CLASSIC_MARKERS,
  layoutRequirement,
  markerExtent,
  markerGeometry,
  markerRoom,
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
  MarkerGeometry,
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
export { requirement } from './plugin.ts';
export { renderRequirement } from './render/render.ts';
