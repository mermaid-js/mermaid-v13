/**
 * Usecase AST (R-PARSE-8, DESIGN §4.2, D475). Every node has a semantic id built from the
 * user's names, and a range into the original source:
 *
 * | element                                  | id                                  |
 * | ---------------------------------------- | ----------------------------------- |
 * | a mention of actor `A` (first)           | `actor:A`                           |
 * | its later mentions                       | `actor:A@2`, `actor:A@3`, …         |
 * | a use case, boundary, JSON table         | `usecase:A`, `boundary:B`, `json:P` |
 * | relation `A e1@--> B`                    | `rel:e1`                            |
 * | relation `A --> B` (no id)               | `rel:A->B`, then `rel:A->B@2`, …    |
 * | the `n`th note                           | `note:<n>`                          |
 * | `classDef`, `class`, `style`, `X@{ … }`  | `classDef:1`, `class:1`, …          |
 *
 * A mention's kind is the kind its id resolves to (an end of a relation that nothing declares is
 * a use case). Each model element carries the id of its first mention. `%`, `>`, `@` and `#`
 * in names are percent-encoded.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

export type UsecaseElementKind = 'actor' | 'usecase' | 'boundary' | 'json' | 'edge';

/**
 * One mention of an element by name: an actor or use case declaration, or an end of a
 * relation. `kind` is the kind the name resolves to.
 */
export interface UsecaseElementNode extends AstNode<'Element'> {
  /** The element id: the name, or for a quoted name its label with each non-word as `_`. */
  name: string;
  /** The name as written; for a quoted name the text between the quotes. */
  nameRange: Range;
  kind: UsecaseElementKind;
  /** It declares the element (`actor A`, `A(label)`, `A@{…}`, `A <<s>>`, a boundary member). */
  declares: boolean;
  /** `(…)` / `[…]` after the name, without them. */
  labelRange?: Range;
}

/** `A --> B` (also `actor A --> B`); its children are the two ends. */
export interface UsecaseRelationNode extends AstNode<'Relation'> {
  source: string;
  target: string;
  /** `e1` of `e1@-->`. */
  edgeId?: string;
  edgeIdRange?: Range;
  /** The arrow, a label between its parts included. */
  arrowRange: Range;
  labelRange?: Range;
  children: [UsecaseElementNode, UsecaseElementNode];
}

/** `systemBoundary … end`; its children are its members. */
export interface UsecaseBoundaryNode extends AstNode<'Boundary'> {
  name: string;
  nameRange: Range;
  /** The `end`; absent when the boundary is not closed. */
  endRange?: Range;
  children: UsecaseElementNode[];
}

/** `note for A label`. */
export interface UsecaseNoteNode extends AstNode<'Note'> {
  target: string;
  targetRange: Range;
}

/** `json P@{ … }`. */
export interface UsecaseJsonNode extends AstNode<'Json'> {
  name: string;
  nameRange: Range;
  /** The object, braces included. */
  bodyRange: Range;
}

export type UsecaseSimpleKind =
  | 'Metadata'
  | 'ClassDef'
  | 'Class'
  | 'Style'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr';

/** A statement without children; `refs` are the element names it names. */
export interface UsecaseSimpleNode extends AstNode<UsecaseSimpleKind> {
  refs: string[];
}

/** The `usecase-beta` keyword. */
export type UsecaseHeaderNode = AstNode<'Header'>;

export type UsecaseStatementNode =
  | UsecaseHeaderNode
  | UsecaseElementNode
  | UsecaseRelationNode
  | UsecaseBoundaryNode
  | UsecaseNoteNode
  | UsecaseJsonNode
  | UsecaseSimpleNode;

export interface UsecaseDocument extends AstNode<'Document'> {
  children: UsecaseStatementNode[];
}
