/**
 * Mindmap AST (R-PARSE-8, DESIGN §4.2, D289). One node per node statement, flat and in source
 * order, each with a semantic id and a range into the original source:
 *
 * | statement                         | id          |
 * | --------------------------------- | ----------- |
 * | node `a`, `a[…]` or `[a]`         | `n:a`       |
 * | the k-th node with the id `a`     | `n:a@k`     |
 *
 * An id-less node's id is its label; blanks around the id are dropped. The `:::` and
 * `::icon()` lines after a node are its `decorations`, not nodes of their own; edges are derived
 * (`MindmapModel`) and have no AST id. A node v12 rejected (a second root) still has its AST
 * node.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { MindmapShape } from '../model.ts';

/** A `:::class …` or `::icon(…)` line, on the node it decorates. */
export interface MindmapDecoration {
  type: 'Class' | 'Icon';
  /** The text after `:::` or between the parentheses, as written. */
  text: string;
  /** The whole decoration, `:::` or `::icon(` and `)` included. */
  range: Range;
}

/** A node statement: an id, a shape with its text, or both. */
export interface MindmapNodeNode extends AstNode<'Node'> {
  /** The id as written; undefined for a node written as a shape alone (`[label]`). */
  nodeId?: string;
  /** The text in the shape (the inside of a string), or the id when shapeless. */
  label: string;
  shape: MindmapShape;
  /** The indent width as written (tabs count 1); 0 with none. */
  indent: number;
  /** In source order. */
  decorations: MindmapDecoration[];
}

export interface MindmapDocument extends AstNode<'Document'> {
  children: MindmapNodeNode[];
}
