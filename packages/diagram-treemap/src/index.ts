/**
 * `@mermaid-js/diagram-treemap` (spec #428): the treemap plugin, in progress. So far its parser
 * and detection, the model and the AST (#484); the layout, renderer and plugin follow (T3–T5).
 * The token stream, which only tests read, is at `./testing`.
 */
export {
  detectTreemap,
  parseTreemap,
  TREEMAP_CLASSDEF_NEXT_LINE,
  TREEMAP_INVALID_VALUE,
  TREEMAP_ROWS_ON_ONE_LINE,
  TREEMAP_TRAILING_BLANK,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { TreemapParseOptions, TreemapParseResult } from './parser/index.ts';
export { classStyles } from './model.ts';
export type { TreemapClass, TreemapModel, TreemapNode } from './model.ts';
