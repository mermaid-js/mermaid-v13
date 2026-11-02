/**
 * Flowchart AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id built from the user's
 * names (`n:A`, `n:A@2`, `e:A>B`, `e:A>B#2`, `s:one`), or `<kind>:<n>` for statements without
 * a name (`style:1`, `classDef:2`, …), and a range into the original source.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { LabelType } from './model.ts';

/** A label as written: its text (as v12 read it) and the range of its tokens. */
export interface FlowLabelNode {
  text: string;
  type: LabelType;
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

export interface FlowSubgraph extends AstNode<'Subgraph'> {
  /** Model id (generated `subGraph<n>` when the title has spaces and no id). */
  name: string;
  title?: FlowLabelNode;
  children: FlowStatementNode[];
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
}

/** `graph TD` / `flowchart LR`. */
export interface FlowHeader extends AstNode<'Header'> {
  keyword: string;
  direction: string;
}

export type FlowStatementNode = FlowHeader | FlowChainStmt | FlowSubgraph | FlowSimpleStmt;

export interface FlowDocument extends AstNode<'Document'> {
  children: FlowStatementNode[];
}
