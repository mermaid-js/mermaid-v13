/**
 * Cynefin AST (R-PARSE-8, DESIGN §4.2 adapted, spec #423). Every node has a semantic id and a
 * range into the original source:
 *
 * | element                                    | id                                  |
 * | ------------------------------------------ | ----------------------------------- |
 * | `cynefin-beta` / `cynefin-beta:`           | `header`                            |
 * | the first block of a domain, `complex …`   | `d:complex`                         |
 * | a later block of the same domain           | `d:complex@2`, `d:complex@3`, …     |
 * | item `"Probe"` of a `complex` block        | `i:complex/Probe`                   |
 * | the same label again in a `complex` block  | `i:complex/Probe@2`, …              |
 * | `complex --> clear`                        | `t:complex>clear`                   |
 * | a parallel repeat of it                    | `t:complex>clear#2`, …              |
 * | `title …`, `accTitle: …`, `accDescr …`     | `title`, `accTitle`, `accDescr`; then `@2`, … |
 *
 * A self-loop (`complex --> complex`) keeps its node and id; the model leaves it out (D365).
 * In labels `%`, `>`, `@` and `#` are percent-encoded (`%25`, `%3E`, `%40`, `%23`), so the
 * suffixes stay unambiguous, and so are the characters XML 1.0 cannot hold (`\0` is `%00`, a
 * lone surrogate `%D800`), so the `data-ast` a renderer writes is the id.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { CynefinDomainName } from '../model.ts';

/** `cynefin-beta` or `cynefin-beta:`. */
export interface CynefinHeaderNode extends AstNode<'Header'> {
  /** Written with the colon. */
  colon: boolean;
}

/** One quoted item of a block. */
export interface CynefinItemNode extends AstNode<'Item'> {
  /** The label as v12's DB kept it (see `CynefinItem.label`). */
  label: string;
}

/** `complex` and the items after it. Its range runs to the last item. */
export interface CynefinDomainNode extends AstNode<'Domain'> {
  name: CynefinDomainName;
  /** The domain name. */
  nameRange: Range;
  children: CynefinItemNode[];
}

/** `from --> to`, with an optional `: "label"`. */
export interface CynefinTransitionNode extends AstNode<'Transition'> {
  from: CynefinDomainName;
  fromRange: Range;
  to: CynefinDomainName;
  toRange: Range;
  /** The label, converted; absent without `:`. `""` stays `""` here (the model drops it). */
  label?: string;
  /** The quoted label, quotes included. */
  labelRange?: Range;
}

/** `title …`, `accTitle: …` and `accDescr …`; `text` is the converted value. */
export interface CynefinTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type CynefinStatementNode =
  | CynefinHeaderNode
  | CynefinDomainNode
  | CynefinTransitionNode
  | CynefinTextNode;

export interface CynefinDocument extends AstNode<'Document'> {
  children: CynefinStatementNode[];
}
