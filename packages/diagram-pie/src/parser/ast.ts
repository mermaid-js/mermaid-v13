/**
 * Pie AST (R-PARSE-8, DESIGN §4.2 adapted). Every node has a semantic id and a range into the
 * original source:
 *
 * | element                          | id                               |
 * | -------------------------------- | -------------------------------- |
 * | `pie` (with `showData`)          | `pie`                            |
 * | section `"Dogs" : 42`            | `slice:Dogs`                     |
 * | a later section labelled `Dogs`  | `slice:Dogs@2`, `slice:Dogs@3`, … |
 * | `title …`                        | `title`, then `title@2`, …       |
 * | `accTitle: …`                    | `accTitle`, then `accTitle@2`, … |
 * | `accDescr …`                     | `accDescr`, then `accDescr@2`, … |
 *
 * In labels `%`, `>`, `@` and `#` are percent-encoded (`%25`, `%3E`, `%40`, `%23`), so the
 * `@n` suffix stays unambiguous, and so are the characters XML 1.0 cannot hold (`\0` is `%00`,
 * a lone surrogate `%D800`), so the `data-ast` the renderer writes is the id. The model's section keeps the id of its first occurrence
 * (pitfall 9).
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `pie` or `pie showData`. */
export interface PieHeaderNode extends AstNode<'Header'> {
  showData: boolean;
}

/** `"label" : value`. Every section has one, a repeated label or a negative value too. */
export interface PieSliceNode extends AstNode<'Slice'> {
  /** The label as v12's DB kept it (see `PieSection.label`). */
  label: string;
  /** The quoted string, quotes included. */
  labelRange: Range;
  value: number;
  valueRange: Range;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface PieTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type PieStatementNode = PieHeaderNode | PieSliceNode | PieTextNode;

export interface PieDocument extends AstNode<'Document'> {
  children: PieStatementNode[];
}
