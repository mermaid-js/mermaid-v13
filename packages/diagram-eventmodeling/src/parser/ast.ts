/**
 * Event modeling AST (R-PARSE-8, DESIGN §4.2 adapted, D528). Every node has a semantic id and a
 * range into the original source, from its first token to its last:
 *
 * | element                                  | id                                              |
 * | ---------------------------------------- | ----------------------------------------------- |
 * | `eventmodeling`                          | `eventmodeling`                                 |
 * | `tf 01 …`, `rf 01 …` (any keyword)       | `frame:01` (a repeated id, an error: `@2`, …)   |
 * | `->> 01` in frame `02`                   | `relation:01->02` (a child of the frame; `@2`)  |
 * | `entity A.B`                             | `entity:A.B` (`@2`, …)                          |
 * | `data D { … }`                           | `data:D` (`@2`, …)                              |
 * | `note 01 { … }`                          | `note:01` (`@2`, … for the next on `01`)        |
 * | `gwt 01 given …`                         | `gwt:01` (`@2`, …)                              |
 * | `title …`, `accTitle: …`, `accDescr …`   | `title`, `accTitle`, `accDescr` (`@2`, …)       |
 *
 * Names are ASCII words and dots, and frame ids digits, so no id needs escaping. A relation the
 * layout infers (a frame with no `->>`) has no AST node: no statement wrote it.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** A token's value and range: a frame id, a name, a kind keyword. */
export interface EventModelText {
  value: string;
  range: Range;
}

/** Inline data or a data block, with its optional data type. */
export interface EventModelDataNode {
  /** The data type between backticks, as written; absent when none. */
  type?: EventModelText;
  /** The text between the braces or quotes, dedented and trimmed (D523). */
  text: string;
  /** The data token, braces or quotes included. */
  range: Range;
}

/** `eventmodeling`. */
export type EventModelHeaderNode = AstNode<'Header'>;

/** `->> 01`: one source of a frame. */
export interface EventModelSourceNode extends AstNode<'Source'> {
  /** The source frame id as written. */
  frame: EventModelText;
}

/** `tf 01 evt Name ->> … [[ref]] { data }` (`timeframe`, `rf`, `resetframe`). */
export interface EventModelFrameNode extends AstNode<'Frame'> {
  /** `tf`, `timeframe`, `rf` or `resetframe`. */
  keyword: EventModelText;
  reset: boolean;
  frame: EventModelText;
  /** The kind as written (`evt`, `event`, …). */
  kind: EventModelText;
  /** The qualified name, dots included. */
  name: EventModelText;
  children: EventModelSourceNode[];
  /** `[[ref]]`: the name inside. */
  dataRef?: EventModelText;
  data?: EventModelDataNode;
}

/** `entity A.B`. */
export interface EventModelEntityNode extends AstNode<'Entity'> {
  name: EventModelText;
}

/** `data Name { … }`. */
export interface EventModelDataBlockNode extends AstNode<'Data'> {
  name: EventModelText;
  data: EventModelDataNode;
}

/** `note 01 { … }`. */
export interface EventModelNoteNode extends AstNode<'Note'> {
  frame: EventModelText;
  data: EventModelDataNode;
}

/** `<kind> <Name>` in a `gwt`. */
export interface EventModelGwtStepNode {
  kind: EventModelText;
  name: EventModelText;
}

/** `gwt 01 given … [when …] then …`. */
export interface EventModelGwtNode extends AstNode<'Gwt'> {
  frame: EventModelText;
  given: EventModelGwtStepNode[];
  when: EventModelGwtStepNode[];
  then: EventModelGwtStepNode[];
}

/** `title …`, `accTitle: …` or `accDescr …`: the value with the keyword stripped (D524). */
export interface EventModelTextNode extends AstNode<'Title' | 'AccTitle' | 'AccDescr'> {
  text: string;
}

export type EventModelStatementNode =
  | EventModelHeaderNode
  | EventModelFrameNode
  | EventModelEntityNode
  | EventModelDataBlockNode
  | EventModelNoteNode
  | EventModelGwtNode
  | EventModelTextNode;

/** The root: every statement in source order (flat; a frame's sources are its children). */
export interface EventModelDocument extends AstNode<'Document'> {
  children: EventModelStatementNode[];
}
