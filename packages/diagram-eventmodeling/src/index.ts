/**
 * `@mermaid-js/diagram-eventmodeling`: the event modeling plugin (spec #527). The
 * runtime entry has the parser, detection, the model and the AST (#602), the model's lanes,
 * boxes and relations (`eventModelStructure`), the custom layout (`layoutEventModel`, #604), and
 * the SVG renderer, theme table and plugin object (`eventmodeling`, #606), registered from the
 * package's manifest (#611). The language facet is `./language` (#609). The lexer and its parity gate's helpers are in `./testing` (#600).
 */
export { eventmodeling } from './plugin.ts';
export { renderEventModel } from './render/index.ts';
export type { EventModelRenderContext } from './render/index.ts';
export {
  EVENTMODELING_CONFIG_INVALID,
  EVENTMODELING_DUPLICATE_FRAME,
  EVENTMODELING_INVALID_SOURCE,
  EVENTMODELING_UNKNOWN_DATA,
  EVENTMODELING_UNKNOWN_FRAME,
  EVENTMODELING_UNKNOWN_SOURCE,
} from './codes.ts';
export { detectEventModeling, parseEventModel } from './parser/index.ts';
export type * from './parser/ast.ts';
export type { EventModelParseOptions, EventModelParseResult } from './parser/index.ts';
export type {
  EventModel,
  EventModelData,
  EventModelDataBlock,
  EventModelEntity,
  EventModelFrame,
  EventModelGwt,
  EventModelGwtStep,
  EventModelKind,
  EventModelNote,
} from './model.ts';
export { eventModelStructure } from './structure.ts';
export type {
  EventModelBand,
  EventModelBox,
  EventModelLane,
  EventModelRelation,
  EventModelStructure,
} from './structure.ts';
export { EVENTMODELING_METRICS, layoutEventModel } from './layout/index.ts';
export type {
  EventModelBoxLayout,
  EventModelLaneLayout,
  EventModelLayout,
  EventModelLayoutContext,
  EventModelMetrics,
  EventModelRelationLayout,
  EventModelRoute,
  PlacedLabel,
  Point,
  Rect,
} from './layout/index.ts';
