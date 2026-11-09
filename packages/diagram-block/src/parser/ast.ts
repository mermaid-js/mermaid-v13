/**
 * Block AST (R-PARSE-8, DESIGN §4.2, D448). One node per statement in source order, a
 * composite holding the statements of its body, each with a semantic id and a range into the
 * original source:
 *
 * | statement                                   | id                          |
 * | ------------------------------------------- | --------------------------- |
 * | block `a` (leaf, composite header, edge end) | `block:a`                  |
 * | a later mention of `a`                      | `block:a@2`, `@3`, …        |
 * | `space`, anonymous `block … end`            | `block:id-<n>` (the model's) |
 * | edge `a --> b`                              | `edge:a->b`, `@2` for repeats |
 * | `classDef c …`                              | `classDef:c`, `@2` for repeats |
 * | the n-th `class` / `style` / `columns`      | `class:<n>`, `style:<n>`, `columns:<n>` |
 *
 * In names `%`, `>`, `@`, `#` and the characters XML 1.0 cannot hold are percent-encoded, so
 * the separators stay unambiguous and `data-ast` can hold the id. The model keeps the first
 * mention's id for a block (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** A block mention: an id with an optional shape and label, and for a first node a span. */
export interface BlockLeafNode extends AstNode<'Block'> {
  /** The id as written. */
  name: string;
  nameRange: Range;
  /** The shape's opener and closer as written (`[]`, `((` `))` → `(())`, `<[]>`). */
  shape?: string;
  label?: string;
  /** The span as written after `:`. */
  span?: number;
  /** A block arrow's directions as v12's lexer read them (blanks kept). */
  directions?: string[];
}

/** An edge between the block before it and the block after it. Its range is the link. */
export interface BlockEdgeNode extends AstNode<'Edge'> {
  start: string;
  end: string;
  /** The link as written, trimmed (the closing one for a labelled edge). */
  link: string;
  label?: string;
}

/**
 * `block:id … end` (with its header's fields) or an anonymous `block … end`. Its children are
 * the body. The rest of a header chain (`block:a --> b`) is the edges and blocks right after
 * the composite at its own level, as in the model (GAPS #554).
 */
export interface BlockCompositeNode extends AstNode<'Composite'> {
  /** The header id; undefined for an anonymous composite. */
  name?: string;
  nameRange?: Range;
  shape?: string;
  label?: string;
  span?: number;
  children: BlockStatementNode[];
}

/** `space` or `space:n`. */
export interface BlockSpaceNode extends AstNode<'Space'> {
  /** The cells as written. */
  cells: number;
}

/** `columns n` or `columns auto` (-1). */
export interface BlockColumnsNode extends AstNode<'Columns'> {
  /** As written: -1 for `auto`. */
  columns: number;
}

/** `classDef name styles`. */
export interface BlockClassDefNode extends AstNode<'ClassDef'> {
  name: string;
  nameRange: Range;
  css: string;
}

/** An id named by `class` or `style`. */
export interface BlockTarget {
  name: string;
  range: Range;
}

/** `class a, b name`. */
export interface BlockClassNode extends AstNode<'Class'> {
  targets: BlockTarget[];
  /** The rest of the line, trimmed (v12 kept it as one class). */
  className: string;
}

/** `style a, b styles`. */
export interface BlockStyleNode extends AstNode<'Style'> {
  targets: BlockTarget[];
  styles: string;
}

export type BlockStatementNode =
  | BlockLeafNode
  | BlockEdgeNode
  | BlockCompositeNode
  | BlockSpaceNode
  | BlockColumnsNode
  | BlockClassDefNode
  | BlockClassNode
  | BlockStyleNode;

export interface BlockDocument extends AstNode<'Document'> {
  children: BlockStatementNode[];
}
