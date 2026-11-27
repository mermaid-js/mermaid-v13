/**
 * Kanban AST (R-PARSE-8, DESIGN §4.2, D289). One node per item statement, flat and in source
 * order, each with a semantic id and a range into the original source:
 *
 * | statement                         | id          |
 * | --------------------------------- | ----------- |
 * | item `a`, `a[…]` or `[a]`         | `n:a`       |
 * | the k-th item with the id `a`     | `n:a@k`     |
 * | the k-th `accTitle: …`            | `accTitle:k` |
 * | the k-th `accDescr …`             | `accDescr:k` |
 *
 * Columns and cards share the scheme. An id-less item's id is its text; blanks around the id
 * are dropped. The `@{ … }` data, `:::` and `::icon()` lines after an item belong to it, not
 * nodes of their own.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** A `:::class …` or `::icon(…)` line, on the item it decorates. */
export interface KanbanDecoration {
  type: 'Class' | 'Icon';
  /** The text after `:::` or between the parentheses, as written. */
  text: string;
  /** The whole decoration, `:::` or `::icon(` and `)` included. */
  range: Range;
}

/** An item's `@{ … }` data (back-to-back blocks are one, as in v12). */
export interface KanbanData {
  /** The YAML text v12 read: the blocks joined, `<br/>` for line breaks in quoted runs. */
  text: string;
  /** From the first `@` to the last `}` (or the end of the text when unclosed). */
  range: Range;
}

/** An item statement: an id, a shape with its text, or both, and optional data. */
export interface KanbanItemNode extends AstNode<'Item'> {
  /** The id as written; undefined for an item written as a shape alone (`[label]`). */
  nodeId?: string;
  /** The text in the shape (the inside of a string), or the id when shapeless. */
  text: string;
  /** The indent width as written (tabs count 1); 0 with none. */
  indent: number;
  data?: KanbanData;
  /** In source order. */
  decorations: KanbanDecoration[];
}

/** `accTitle: …`, `accDescr: …` or `accDescr { … }` (D742); `text` is the value as set. */
export interface KanbanAccNode extends AstNode<'AccTitle' | 'AccDescr'> {
  text: string;
}

export type KanbanStatementNode = KanbanItemNode | KanbanAccNode;

export interface KanbanDocument extends AstNode<'Document'> {
  children: KanbanStatementNode[];
}
