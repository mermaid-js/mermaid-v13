/**
 * Venn AST (R-PARSE-8, DESIGN §4.2 adapted, D418). One node per statement, flat and in source
 * order, each with a semantic id and a range into the original source:
 *
 * | statement                              | id                         |
 * | -------------------------------------- | -------------------------- |
 * | `set A`                                | `set:A`                    |
 * | `union B,A` (ids sorted, as v12)       | `union:A+B`                |
 * | `text A t1`, an indented `text t1`     | `text:t1`                  |
 * | the n-th `style` statement             | `style:<n>` (1-based)      |
 * | `title …`                              | `title`                    |
 * | a repeat of any of these but `style`   | `…@2`, `…@3`, …            |
 *
 * Ids are the model's (quotes removed). In them `%`, `>`, `@`, `#` and `+` are percent-encoded
 * (`%25`, `%3E`, `%40`, `%23`, `%2B`), so the separators stay unambiguous, and so are the
 * characters XML 1.0 cannot hold, so the `data-ast` a renderer writes is the id.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** An id as written: the model's value and the token's range (quotes included). */
export interface VennName {
  name: string;
  range: Range;
}

/** `set A`, `set A["label"]`, `set A:10`. */
export interface VennSetNode extends AstNode<'Set'> {
  name: VennName;
  label?: string;
  /** As written (`parseFloat`); absent without `: size`. */
  size?: number;
}

/** `union A,B`, with an optional label and size. */
export interface VennUnionNode extends AstNode<'Union'> {
  /** In written order. */
  members: VennName[];
  label?: string;
  size?: number;
}

/** `text A,B t1["label"]`, or an indented `text t1` under a `set` or `union`. */
export interface VennTextStatementNode extends AstNode<'Text'> {
  /** Written under a `set` or `union`, which gives its sets. */
  indented: boolean;
  /** The sets as written (written order); empty when indented. */
  members: VennName[];
  name: VennName;
  label?: string;
}

/** One `key: value` of a `style` statement. */
export interface VennStyleField {
  key: string;
  keyRange: Range;
  /** As v12 joined it (see `VennModel`). */
  value: string;
  valueRange: Range;
}

/** `style A,B fill: #f00, color: red`. */
export interface VennStyleNode extends AstNode<'Style'> {
  /** In written order. */
  targets: VennName[];
  fields: VennStyleField[];
}

/** `title …`. */
export interface VennTitleNode extends AstNode<'Title'> {
  /** As v12 kept it (after `title` and one blank), before D416's quote removal. */
  text: string;
}

export type VennStatementNode =
  | VennSetNode
  | VennUnionNode
  | VennTextStatementNode
  | VennStyleNode
  | VennTitleNode;

export interface VennDocument extends AstNode<'Document'> {
  children: VennStatementNode[];
}
