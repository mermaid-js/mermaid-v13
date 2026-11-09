/**
 * `@mermaid-js/diagram-eventmodeling`: the event modeling plugin (spec #527), in progress. The
 * runtime entry has the parser, detection, the model and the AST (#602), and the model's lanes,
 * boxes and relations (`eventModelStructure`, which the layout reuses). The layout and renderer
 * land with T3 and T4, the manifest with T5. The lexer and its parity gate's helpers are in
 * `./testing` (#600).
 */
export {
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
