/**
 * Sankey AST (R-PARSE-8, DESIGN §4.2, D397). One `Link` per row, in source order, each holding
 * the `Node`s first named in it:
 *
 * | element                               | id            |
 * | ------------------------------------- | ------------- |
 * | node `a` (its first occurrence)       | `node:a`      |
 * | the row `a,b,…`                       | `link:a->b`   |
 * | the k-th row from `a` to `b`          | `link:a->b@k` |
 *
 * `%`, `>`, `@` and `#` in names are percent-encoded (`parser/ids.ts`). A later occurrence of a
 * name is a reference to its node (D397), not a node of its own.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** One of a row's three fields. */
export interface SankeyField {
  /** The field as v12 read it: trimmed, with `""` read as `"` for a name (not for a value). */
  text: string;
  /** Written in quotes. */
  quoted: boolean;
  /** The trimmed field, or the quoted field with its quotes. */
  range: Range;
}

/** A node, at the field that names it first. */
export interface SankeyNodeNode extends AstNode<'Node'> {
  name: string;
}

/** A row: `source,target,value`. */
export interface SankeyLinkNode extends AstNode<'Link'> {
  source: SankeyField;
  target: SankeyField;
  value: SankeyField;
  /** The nodes this row names first, source before target. */
  children?: SankeyNodeNode[];
}

export interface SankeyDocument extends AstNode<'Document'> {
  children: SankeyLinkNode[];
}
