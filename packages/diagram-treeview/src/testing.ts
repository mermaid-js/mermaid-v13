/**
 * `@mermaid-js/diagram-treeview/testing`: what the conformance gates read and a render never
 * does (as treemap's and wardley's): v12's Langium token names, the token stream, the box pass
 * and the trivia set. They live outside the runtime entry, so the chunk mermaid loads for a
 * treeView render stays small (D217).
 */
export {
  LANGIUM_NAMES,
  TREEVIEW_TRIVIA,
  TreeViewTokenKind,
  treeViewLex,
  treeViewTokens,
  treeViewView,
} from './parser/index.ts';
export type {
  BoxError,
  BoxPass,
  BoxRewrite,
  TreeViewToken,
  TreeViewTokens,
  TreeViewView,
} from './parser/index.ts';
