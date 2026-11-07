/**
 * Info AST (R-PARSE-8, DESIGN §4.2 adapted). Every node has a semantic id and a range into the
 * original source:
 *
 * | element                          | id                               |
 * | -------------------------------- | -------------------------------- |
 * | `info` (with `showInfo`)         | `info`                           |
 * | `title …`                        | `title`, then `title@2`, …       |
 * | `accTitle: …`                    | `accTitle`, then `accTitle@2`, … |
 * | `accDescr …`                     | `accDescr`, then `accDescr@2`, … |
 *
 * The header runs from `info` to `showInfo` when there is one, which may be on a later line.
 */
import type { AstNode } from '@mermaid-js/core/parser-kit';

/** `info` or `info showInfo`. */
export interface InfoHeaderNode extends AstNode<'Header'> {
  showInfo: boolean;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface InfoTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type InfoStatementNode = InfoHeaderNode | InfoTextNode;

export interface InfoDocument extends AstNode<'Document'> {
  children: InfoStatementNode[];
}
