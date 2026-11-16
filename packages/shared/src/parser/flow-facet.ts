// The flow family's language facet pieces (completion and hover), their own chunk: a
// diagram's `./language` entry loads them, its parser does not.
export { flowCompletions } from './flow-completions.ts';
export type { FlowCompletionDialect } from './flow-completions.ts';
export {
  FLOW_CURVES,
  FLOW_DIRECTION_DOCS,
  FLOW_EDGE_DATA,
  flowKeywordItems,
} from './flow-facet-tables.ts';
export {
  flowBareKeywordHover,
  flowClassHover,
  flowShapeHover,
  flowTokenHover,
} from './flow-hover.ts';
export type { FlowTokenHoverDialect } from './flow-hover.ts';
export { flowNameReason } from './flow-names.ts';
