/**
 * Treemap AST (R-PARSE-8, DESIGN §4.2 adapted, D408). Every node has a semantic id and a range
 * into the original source (from the first character after the blanks before it). The rows are
 * flat, in source order; the tree they make is the model's.
 *
 * | element                                  | id                                         |
 * | ---------------------------------------- | ------------------------------------------ |
 * | `treemap` or `treemap-beta`              | `treemap`                                  |
 * | a section or leaf `"Child"` in `"Root"`  | `node:Root/Child`, a repeated path `@2`, … |
 * | `classDef name …`                        | `classDef:name`, a repeat `@2`, …          |
 * | `title …`, `accTitle: …`, `accDescr …`   | `title`, `accTitle`, `accDescr` (`@2`, …)  |
 *
 * A node's path is the names of the sections above it and its own, joined by `/`; in a name
 * `%`, `/` and `@` are percent-encoded (`%25`, `%2F`, `%40`), so a path reads back one way.
 * The model's nodes and classes keep the id of their (first) AST node (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `treemap` or `treemap-beta`. */
export type TreemapHeaderNode = AstNode<'Header'>;

/** What a section row and a leaf row have in common. */
interface TreemapRowFields {
  /** The name between the quotes. */
  name: string;
  /** The quoted name, quotes included. */
  nameRange: Range;
  /** The row's indent as v12 read it: the length of the blank run before the name, else 0. */
  indent: number;
  /** Where the row sits in the tree: 0 at the top (the model's `depth`). */
  depth: number;
  /** The `:::name` after the name or value. */
  classSelector?: string;
  classRange?: Range;
}

/** `"name"` (and `:::class`): a section, from the name to the class. */
export interface TreemapSectionNode extends AstNode<'Section'>, TreemapRowFields {}

/** `"name": value` or `"name", value` (and `:::class`), from the name to the value or class. */
export interface TreemapLeafNode extends AstNode<'Leaf'>, TreemapRowFields {
  /** v12's conversion of the value (`NaN` for `.`, D402). */
  value: number;
  /** The value as written. */
  valueText: string;
  valueRange: Range;
}

/** `classDef name styles;`, from `classDef` to its end (a `;` included). */
export interface TreemapClassDefNode extends AstNode<'ClassDef'> {
  name: string;
  nameRange: Range;
  /** The styles as written, before v12's split; absent when there are none. */
  styleText?: string;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface TreemapTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type TreemapRowNode = TreemapSectionNode | TreemapLeafNode;

export type TreemapStatementNode =
  | TreemapHeaderNode
  | TreemapSectionNode
  | TreemapLeafNode
  | TreemapClassDefNode
  | TreemapTextNode;

export interface TreemapDocument extends AstNode<'Document'> {
  children: TreemapStatementNode[];
}
