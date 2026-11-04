/**
 * State AST (R-PARSE-8, DESIGN §4.2, adapted). Every node has a semantic id built from the
 * user's names and a range into the original source:
 *
 * | element                                     | id                                |
 * | ------------------------------------------- | --------------------------------- |
 * | a state mention (`A`, `state "…" as A`, …)  | `n:A`, then `n:A@2`, …            |
 * | `[*]` read as a start or an end             | `n:[*]start` at the top level, `n:X/[*]start` / `n:X/[*]end` inside composite `X` |
 * | a transition                                | `e:A>B`, `e:A>B#2` for a parallel one |
 * | a composite state `state X { … }`           | `s:X`                             |
 * | its regions, when `--` splits it            | `r:X#1`, `r:X#2`, …               |
 * | a note                                      | `note:<ordinal>`                  |
 * | a statement without a name (`classDef`, …)  | `st:<ordinal>`                    |
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';

/** `stateDiagram` / `stateDiagram-v2`. */
export interface StateHeader extends AstNode<'Header'> {
  keyword: string;
}

/**
 * A state mention: `A`, `A : description`, `A:::class`, `[*]`, `state "…" as A`,
 * `state f <<fork>>`.
 */
export interface StateStmt extends AstNode<'State'> {
  /** The name as written; `[*]` for a start or end. */
  name: string;
  nameRange: Range;
  /** `fork`, `join` or `choice` for `state x <<fork>>` and the like. */
  pseudo?: 'fork' | 'join' | 'choice';
  description?: string;
  className?: string;
  /** `state X` on its own: it declares nothing, and v12 draws no state for it. */
  declaredOnly?: boolean;
}

/** `A --> B : label`; its children are the two state mentions. */
export interface StateTransitionStmt extends AstNode<'Transition'> {
  from: string;
  to: string;
  label?: string;
  children: [StateStmt, StateStmt];
}

/** A region of a composite state: the statements between `--` separators. */
export interface StateRegionNode extends AstNode<'Region'> {
  children: StateStatementNode[];
}

/** `state X { … }` / `state "…" as X { … }`. */
export interface StateCompositeStmt extends AstNode<'Composite'> {
  name: string;
  nameRange: Range;
  description?: string;
  /** Its statements, or its regions when `--` splits it. */
  children: StateStatementNode[] | StateRegionNode[];
}

/** `note left of A : …`, `note right of A … end note`, or a floating `note "…" as N`. */
export interface StateNoteStmt extends AstNode<'Note'> {
  /** The state the note is attached to, or the floating note's own name. */
  target: string;
  side?: 'left' | 'right';
  text: string;
  floating?: boolean;
}

export type StateSimpleKind =
  | 'ClassDef'
  | 'Class'
  | 'Style'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr'
  | 'Click'
  | 'HideEmpty'
  | 'Scale'
  | 'Divider';

/** A statement without children: `classDef`, `class`, `style`, `direction`, `click`, `--`, … */
export interface StateSimpleStmt extends AstNode<StateSimpleKind> {
  /** Ids the statement refers to (states, classes), as written. */
  refs: string[];
}

export type StateStatementNode =
  | StateHeader
  | StateStmt
  | StateTransitionStmt
  | StateCompositeStmt
  | StateNoteStmt
  | StateSimpleStmt;

export interface StateDocument extends AstNode<'Document'> {
  children: StateStatementNode[];
}
