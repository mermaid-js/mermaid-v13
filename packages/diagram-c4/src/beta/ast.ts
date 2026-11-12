/**
 * c4-beta AST (R-PARSE-8, DESIGN §4.2): one node per statement, in source order, each with a
 * semantic id and a range into the original source. An element holds the elements between its
 * braces. The `type` of a node is the `@Type` of its rule in `grammar/c4beta.ebnf`.
 *
 * | statement                    | id                                      |
 * | ---------------------------- | --------------------------------------- |
 * | `c4-beta …`                  | `header`                                |
 * | `person a "A"`, any element  | `element:a`, then `element:a@2`, …      |
 * | `a --> b`, any relation      | `rel:a->b` (`b->a` for `<--`), `@2`, …  |
 * | the n-th `style` statement   | `style:n`                               |
 * | `title`, `accTitle`, …       | `title`, then `title@2`, …              |
 *
 * An id holds letters, digits, `_` and `-`, so no id needs escaping.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { C4BetaDirection, C4BetaElementKind, C4BetaHead, C4BetaKind } from './model.ts';

export interface C4BetaHeaderNode extends AstNode<'Header'> {
  /** The kind as written; absent when the header names none. */
  kind?: C4BetaKind;
}

export interface C4BetaTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export interface C4BetaDirectionNode extends AstNode<'Direction'> {
  direction: C4BetaDirection;
}

export interface C4BetaLegendNode extends AstNode<'Legend'> {
  on: boolean;
}

export interface C4BetaStyleNode extends AstNode<'Style'> {
  target: string;
  entries: { key: string; value: string; range: Range }[];
}

export interface C4BetaElementNode extends AstNode<'Element'> {
  kind: C4BetaElementKind;
  /** The id as written. */
  name: string;
  idRange: Range;
  label: string;
  description?: string;
  technology?: string;
  instances?: string;
  tags: string[];
  children: C4BetaElementNode[];
}

export interface C4BetaRelationNode extends AstNode<'Relation'> {
  from: string;
  fromRange: Range;
  to: string;
  toRange: Range;
  start: C4BetaHead;
  end: C4BetaHead;
  step?: number;
  description?: string;
  technology?: string;
  tags: string[];
}

export type C4BetaStatementNode =
  | C4BetaHeaderNode
  | C4BetaTextNode
  | C4BetaDirectionNode
  | C4BetaLegendNode
  | C4BetaStyleNode
  | C4BetaElementNode
  | C4BetaRelationNode;

export interface C4BetaDocument extends AstNode<'Document'> {
  children: C4BetaStatementNode[];
}
