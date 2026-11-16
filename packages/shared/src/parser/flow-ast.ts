/**
 * The AST nodes every flow-family diagram has (R-PARSE-8, DESIGN §4.2): labels, node mentions,
 * edges, chains, the one-line statements and the header. Every node has a semantic id built
 * from the user's names (`n:A`, `n:A@2`, `e:A>B`, `e:A>B#2`), or `<kind>:<n>` for statements
 * without a name (`style:1`, `classDef:2`, …), and a range into the original source. A diagram
 * adds the nodes of its own blocks and statements.
 */
import type { AstCallback, AstNode, Range } from '@mermaid-js/core/parser-kit';

/** How a label is written: plain, in quotes, or in backticks inside quotes. */
export type FlowLabelType = 'text' | 'string' | 'markdown';

/** A label's text as v12 read it, and how it is written. */
export interface FlowLabelText {
  text: string;
  type: FlowLabelType;
}

/** A label as written: its text (as v12 read it) and the range of its tokens. */
export interface FlowLabelNode extends FlowLabelText {
  range: Range;
}

/** One mention of a node: `A`, `A[label]`, `A:::cls`, `A@{ … }`. */
export interface FlowNodeStmt extends AstNode<'Node'> {
  name: string;
  nameRange: Range;
  /** Bracket shape as v12 names it (`square`, `round`, `diamond`, …). */
  shape?: string;
  label?: FlowLabelNode;
  className?: string;
  /** The `@{ … }` block, braces included. */
  dataRange?: Range;
}

/** One edge of the model (a link between two node mentions; `&` makes several). */
export interface FlowEdge extends AstNode<'Edge'> {
  from: string;
  to: string;
  /** Model edge id (`L_A_B_0` or the user's `id@`). */
  edgeId: string;
  /** Range of the arrow, including its text. */
  linkRange: Range;
  label?: FlowLabelNode;
}

/** `A --> B & C --> D`: node mentions and edges in source order. */
export interface FlowChainStmt extends AstNode<'Chain'> {
  children: (FlowNodeStmt | FlowEdge)[];
}

export type FlowSimpleKind =
  | 'Style'
  | 'ClassDef'
  | 'Class'
  | 'LinkStyle'
  | 'Click'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr';

/** A statement without children: `style`, `classDef`, `class`, `linkStyle`, `click`, … */
export interface FlowSimpleStmt extends AstNode<FlowSimpleKind> {
  /** Ids the statement refers to (nodes, classes), as written. */
  refs: string[];
  /** `click … callback` / `call`: what the interactions plugin binds (DESIGN §12.3). */
  callback?: AstCallback;
}

/** The header line: its keyword and the direction. */
export interface FlowHeader extends AstNode<'Header'> {
  keyword: string;
  direction: string;
}

/** The statements of every dialect, and `X`, the dialect's own. */
export type FlowStatement<X> = FlowHeader | FlowChainStmt | FlowSimpleStmt | X;
