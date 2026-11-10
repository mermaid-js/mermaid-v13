/**
 * Ishikawa AST (R-PARSE-8, DESIGN §4.2 adapted, D497). One node per line of text, flat and in
 * source order, each with a semantic id and a range into the original source:
 *
 * | line                                   | id                         |
 * | -------------------------------------- | -------------------------- |
 * | the first line of text (the effect)    | `effect`                   |
 * | a cause: the j-th under the i-th, …    | `cause:<i>.<j>…` (1-based) |
 *
 * A cause's id is its position in the tree, so it survives edits to its label and to other
 * lines' labels; labels repeat, so they cannot be the id. Blank and comment lines are no node.
 * The range is the line's text without the blanks around it.
 */
import type { AstNode } from '@mermaid-js/core/parser-kit';

/** The effect: the first line of text, on the header line or after it. */
export interface IshikawaEffectNode extends AstNode<'Effect'> {
  /** As the model holds it. */
  text: string;
  /** The indent as written (blanks count one each; 0 with none), which v12 ignored. */
  indent: number;
}

/** A cause line. */
export interface IshikawaCauseNode extends AstNode<'Cause'> {
  /** As the model holds it. */
  text: string;
  /** The indent as written (blanks count one each; 0 with none). */
  indent: number;
  /** v12's level (see `IshikawaCause.level`). */
  level: number;
}

export type IshikawaLineNode = IshikawaEffectNode | IshikawaCauseNode;

export interface IshikawaDocument extends AstNode<'Document'> {
  children: IshikawaLineNode[];
}
