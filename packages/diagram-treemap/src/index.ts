/**
 * `@mermaid-js/diagram-treemap` (spec #428): the treemap plugin (with its theme table, #505), its
 * parser and detection, the model and the AST (#484), the layout and `valueFormat` (#485), and
 * the SVG renderer (#505). The manifest and registry row follow (T5). The token stream, the
 * layout invariants and the test context, which only tests read, are at `./testing`.
 */
export { treemap } from './plugin.ts';
export { renderTreemap } from './render/index.ts';
export type { TreemapRenderContext } from './render/index.ts';
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
export { treemapValueFormat } from './format/index.ts';
export { layoutTreemap, TREEMAP_METRICS } from './layout/index.ts';
export type * from './layout/types.ts';
export type { TreemapLayoutContext } from './layout/index.ts';
export type { TreemapClass, TreemapModel, TreemapNode } from './model.ts';
