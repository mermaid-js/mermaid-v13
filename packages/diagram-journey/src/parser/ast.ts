/**
 * User journey AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id and a range into the
 * original source (blanks at either end left out):
 *
 * | element                                              | id                     |
 * | ---------------------------------------------------- | ---------------------- |
 * | `section <name>`; a later line with the same name    | `s:<name>`; `s:<name>@2`, … |
 * | the n-th task, counting from 1                       | `t:<n>`                |
 * | an actor named in a task; its later mentions          | `a:<name>`; `a:<name>@2`, … |
 * | the header, `title`, `accTitle`, `accDescr`, in order | `st:1`, `st:2`, …      |
 *
 * `st:1` is the header. Names are as written (untrimmed sections, trimmed actors); `%`, `>`,
 * `@` and `#` in them are percent-encoded. An actor mention is a child of its task; the `''`
 * actor (`Task: 5:`) draws nothing and has no node.
 */
import type { AstNode } from '@mermaid-js/core/parser-kit';

/** The `journey` keyword. */
export type JourneyHeaderNode = AstNode<'Header'>;

/** `title …`, `accTitle: …`, `accDescr: …` or `accDescr { … }`. */
export interface JourneyTextStatementNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  /** The value as the model keeps it (see `JourneyModel`). */
  text: string;
}

/** `section <name>`. */
export interface JourneySectionNode extends AstNode<'Section'> {
  /** v12 `substr(8)`: untrimmed. */
  name: string;
}

/** An actor named in a task's data (`Make tea: 5: Me, Cat` names `Me` and `Cat`). */
export interface JourneyActorNode extends AstNode<'Actor'> {
  /** Trimmed, as v12's DB trimmed it. */
  name: string;
}

/** `<name>: <score>[: <actor>, …]`. */
export interface JourneyTaskNode extends AstNode<'Task'> {
  /** Untrimmed, as lexed. */
  name: string;
  /** `Number()` of the first `:`-piece of the data. */
  score: number;
  /** The data as written, from its `:`. */
  data: string;
  /** Every name in the second piece, `''` included (the model's `people`). */
  people: string[];
  /** One per named mention, in order; none for `''`. */
  children: JourneyActorNode[];
}

export type JourneyStatementNode =
  | JourneyHeaderNode
  | JourneyTextStatementNode
  | JourneySectionNode
  | JourneyTaskNode;

export interface JourneyDocument extends AstNode<'Document'> {
  children: JourneyStatementNode[];
}
