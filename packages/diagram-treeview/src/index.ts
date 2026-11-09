/**
 * `@mermaid-js/diagram-treeview` (spec #518): the treeView plugin, in progress. The parser,
 * detection, the model, the AST and icon resolution (#572); the layout and renderer follow
 * (T3–T5). The lexer
 * gated against v12's Langium lexer and v12's box-drawing pass, which only tests read, are at
 * `@mermaid-js/diagram-treeview/testing` (#571).
 */
export {
  detectTreeView,
  parseTreeView,
  TREEVIEW_ANNOTATION_NEXT_LINE,
  TREEVIEW_NAME_READ_AS_TITLE,
  TREEVIEW_NODES_ON_ONE_LINE,
  TREEVIEW_TRAILING_BLANK,
} from './parser/index.ts';
export type * from './parser/ast.ts';
export type { TreeViewParseOptions, TreeViewParseResult } from './parser/index.ts';
export type { TreeViewModel, TreeViewNode } from './model.ts';
export { resolveIcon } from './icons.ts';
export type { TreeViewIconOptions } from './icons.ts';
