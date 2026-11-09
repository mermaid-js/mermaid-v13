/**
 * Railroad AST (R-PARSE-8, DESIGN §4.2 adapted, D517). Every node has a semantic id and a range
 * into the original source:
 *
 * | element                                  | id                                   |
 * | ---------------------------------------- | ------------------------------------ |
 * | the header (`railroad-beta`, …)          | `railroad`                           |
 * | rule `a = … ;`                           | `rule:a`                             |
 * | a later rule named `a`                   | `rule:a@2`, `rule:a@3`, …            |
 * | the rule's definition                    | `rule:a/0`                           |
 * | the definition's second child            | `rule:a/0/1`                         |
 * | `title …`, `accTitle: …`, `accDescr …`   | `title`, `accTitle`, `accDescr`, then `@2`, … |
 *
 * Expression nodes are the model's nodes (`RailroadNode`), one for one and with the same ids:
 * what v12's mapping collapsed or dropped has no node (a one-element sequence, an EBNF group,
 * the operand of a PEG predicate). A node's range is the source it came from: an EBNF exception
 * `a - b` is a sequence over `a - b` whose `-` terminal is the `-`, and a postfix node covers its
 * operand and its operators.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { RailroadNodeKind } from '../model.ts';

/** The header keyword. */
export type RailroadHeaderNode = AstNode<'Header'>;

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface RailroadTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

/** An expression, as drawn: one per {@link RailroadNode}, of the same kind. */
export interface RailroadExpressionNode extends AstNode<RailroadNodeKind> {
  children?: RailroadExpressionNode[];
}

/** `name = definition ;` (`::=` in EBNF, `<-` in PEG). */
export interface RailroadRuleNode extends AstNode<'Rule'> {
  name: string;
  nameRange: Range;
  /** The definition, unless the rule failed to parse. */
  children: RailroadExpressionNode[];
}

export type RailroadStatementNode = RailroadHeaderNode | RailroadTextNode | RailroadRuleNode;

export interface RailroadDocument extends AstNode<'Document'> {
  children: RailroadStatementNode[];
}
