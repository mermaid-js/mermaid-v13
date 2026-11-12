/**
 * Flowchart AST (R-PARSE-8, DESIGN §4.2). Every node has a semantic id built from the user's
 * names (`n:A`, `n:A@2`, `e:A>B`, `e:A>B#2`, `s:one`), or `<kind>:<n>` for statements without
 * a name (`style:1`, `classDef:2`, …), and a range into the original source.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { FlowLabelNode, FlowStatement } from '@mermaid-js/shared/parser/flow';

// The nodes every flow-family diagram has: labels, node mentions, edges, chains, the one-line
// statements and the header (`graph TD` / `flowchart LR`).
export type {
  FlowChainStmt,
  FlowEdge,
  FlowHeader,
  FlowLabelNode,
  FlowNodeStmt,
  FlowSimpleKind,
  FlowSimpleStmt,
} from '@mermaid-js/shared/parser/flow';

export interface FlowSubgraph extends AstNode<'Subgraph'> {
  /** Model id (generated `subGraph<n>` when the title has spaces and no id). */
  name: string;
  title?: FlowLabelNode;
  children: FlowStatementNode[];
}

/** `mermaid id["Title"] { … }`: an embedded diagram block (ADR-15), a node of the host. */
export interface FlowEmbedStmt extends AstNode<'Embed'> {
  name: string;
  nameRange: Range;
  title?: FlowLabelNode;
  /** The body: another diagram's text, as written. */
  bodyRange: Range;
}

/** Flowchart's own statements, besides the family's. */
export type FlowOwnStmt = FlowSubgraph | FlowEmbedStmt;

export type FlowStatementNode = FlowStatement<FlowOwnStmt>;

export interface FlowDocument extends AstNode<'Document'> {
  children: FlowStatementNode[];
}
