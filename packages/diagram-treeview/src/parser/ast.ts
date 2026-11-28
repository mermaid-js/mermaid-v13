/**
 * TreeView AST (R-PARSE-8, DESIGN §4.2 adapted, D487). Every node has a semantic id and a range
 * into the original source (from the first character after the blanks before it; on a line the
 * box pass rewrote, the source characters the token came from). The statements are flat, in
 * source order; the tree they make is the model's.
 *
 * | element                                     | id                                        |
 * | ------------------------------------------- | ----------------------------------------- |
 * | `treeView-beta`                             | `treeView`                                |
 * | a node `index.js` under `src/` under `app/` | `node:app/src/index.js`, a repeat `@2`, … |
 * | `title …`, `accTitle: …`, `accDescr …`      | `title`, `accTitle`, `accDescr` (`@2`, …) |
 *
 * A node's path is the names of the nodes above it and its own (each without its trailing `/`),
 * joined by `/`; in a name `%`, `/` and `@` are percent-encoded (`%25`, `%2F`, `%40`), so a path
 * reads back one way. A file and a directory of one name in one directory share a path, so the
 * second is a repeat.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `treeView-beta`. */
export type TreeViewHeaderNode = AstNode<'Header'>;

/** A node: its name and its annotations, from the name to the last annotation. */
export interface TreeViewNodeNode extends AstNode<'Node'> {
  /** The model's name: quotes, a bare name's trailing blanks and a trailing `/` off. */
  name: string;
  /** The name as written: quotes, trailing `/` and (bare) trailing blanks included. */
  nameRange: Range;
  /** Whether the name ended with `/`. */
  directory: boolean;
  /** Set when the name was written as a quoted markdown string (the model's `markdown`). */
  markdown?: true;
  /** v12's level: the length of the blank run before the name as v12 read it, else 0. */
  level: number;
  /** Where the node sits in the tree: 0 at the top (the model's `depth`). */
  depth: number;
  /**
   * The annotations as v12's Langium AST held them (the last of each kind wins), each with the
   * range of that annotation (blanks before it off): the class of `:::name`; the text between
   * the parentheses of `icon(…)` (`''` for `icon()`); the trimmed text of `## …` (maybe `''`).
   * The model applies v12's `populate` to them (`icon()` is `'none'`, an empty description
   * none).
   */
  cssClass?: string;
  classRange?: Range;
  icon?: string;
  iconRange?: Range;
  description?: string;
  descriptionRange?: Range;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface TreeViewTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type TreeViewStatementNode = TreeViewHeaderNode | TreeViewNodeNode | TreeViewTextNode;

export interface TreeViewDocument extends AstNode<'Document'> {
  children: TreeViewStatementNode[];
}
