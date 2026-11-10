/**
 * Agentflow AST (R-PARSE-8, DESIGN §4.2), on flowchart's scheme (D468): `n:<id>` for vertices
 * and connectors (`n:A@2` for a later mention), `e:A>B` for edges (`#2` for a parallel one),
 * `s:<id>` for flows (`s:subGraph<n>` for an anonymous one, `s:A@2` when an id is opened
 * again), `global:<n>` for `global` blocks, and `<kind>:<n>` for statements without a name
 * (`style:1`, `classDef:2`, …). Every node has a range into the original source.
 */
import type { AstCallback, AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { LabelType } from './model.ts';

/** A label as written: its text (as v12 read it) and the range of its tokens. */
export interface AgentflowLabelNode {
  text: string;
  type: LabelType;
  range: Range;
}

/** One mention of a vertex: `A`, `A[label]`, `A:::cls`, `A@{ … }`. */
export interface AgentflowNodeStmt extends AstNode<'Node'> {
  name: string;
  nameRange: Range;
  /** Bracket shape as v12 names it (`square`, `round`, `diamond`, …). */
  shape?: string;
  label?: AgentflowLabelNode;
  className?: string;
  /** The `@{ … }` block, braces included. */
  dataRange?: Range;
}

/** One edge of the model (a link between two vertex mentions; `&` makes several). */
export interface AgentflowEdge extends AstNode<'Edge'> {
  from: string;
  to: string;
  /** Model edge id (`L_A_B_0` or the user's `id@`). */
  edgeId: string;
  /** Range of the arrow, its text included. */
  linkRange: Range;
  label?: AgentflowLabelNode;
}

/** `A --> B & C --> D`: vertex mentions and edges in source order. */
export interface AgentflowChainStmt extends AstNode<'Chain'> {
  children: (AgentflowNodeStmt | AgentflowEdge)[];
}

/** `flow id[title]@{ … }` … `end`. */
export interface AgentflowFlow extends AstNode<'Flow'> {
  /** Model id (generated `subGraph<n>` for an anonymous flow). */
  name: string;
  /** The `flow` keyword and its header line up to the line break. */
  openerRange: Range;
  title?: AgentflowLabelNode;
  dataRange?: Range;
  children: AgentflowStatementNode[];
}

/** `global` … `end`: nodes that belong to no flow. */
export interface AgentflowGlobal extends AstNode<'Global'> {
  children: AgentflowStatementNode[];
}

/** `connector id[title]@{ … }`. */
export interface AgentflowConnectorStmt extends AstNode<'Connector'> {
  name: string;
  nameRange: Range;
  title?: AgentflowLabelNode;
  dataRange?: Range;
}

export type AgentflowSimpleKind =
  | 'Style'
  | 'ClassDef'
  | 'Class'
  | 'LinkStyle'
  | 'Click'
  | 'Direction'
  | 'AccTitle'
  | 'AccDescr';

/** A statement without children: `style`, `classDef`, `class`, `linkStyle`, `click`, … */
export interface AgentflowSimpleStmt extends AstNode<AgentflowSimpleKind> {
  /** Ids the statement refers to (vertices, classes), as written. */
  refs: string[];
  /** `click … callback` / `call`: what the interactions plugin binds (DESIGN §12.3). */
  callback?: AstCallback;
}

/** `agentflow-beta LR`. */
export interface AgentflowHeader extends AstNode<'Header'> {
  keyword: string;
  direction: string;
}

export type AgentflowStatementNode =
  | AgentflowHeader
  | AgentflowChainStmt
  | AgentflowFlow
  | AgentflowGlobal
  | AgentflowConnectorStmt
  | AgentflowSimpleStmt;

export interface AgentflowDocument extends AstNode<'Document'> {
  children: AgentflowStatementNode[];
}
