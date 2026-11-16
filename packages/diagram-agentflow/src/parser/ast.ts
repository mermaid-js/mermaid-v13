/**
 * Agentflow AST (R-PARSE-8, DESIGN §4.2), on flowchart's scheme (D468): `n:<id>` for vertices
 * and connectors (`n:A@2` for a later mention), `e:A>B` for edges (`#2` for a parallel one),
 * `s:<id>` for flows (`s:subGraph<n>` for an anonymous one, `s:A@2` when an id is opened
 * again), `global:<n>` for `global` blocks, and `<kind>:<n>` for statements without a name
 * (`style:1`, `classDef:2`, …). Every node has a range into the original source.
 */
import type { AstNode, Range } from '@mermaid-js/core/parser-kit';
import type { FlowLabelNode, FlowStatement } from '@mermaid-js/shared/parser/flow';

// The nodes every flow-family diagram has: labels, vertex mentions, edges, chains, the one-line
// statements and the header (`agentflow-beta LR`).
export type {
  FlowChainStmt as AgentflowChainStmt,
  FlowEdge as AgentflowEdge,
  FlowHeader as AgentflowHeader,
  FlowLabelNode as AgentflowLabelNode,
  FlowNodeStmt as AgentflowNodeStmt,
  FlowSimpleKind as AgentflowSimpleKind,
  FlowSimpleStmt as AgentflowSimpleStmt,
} from '@mermaid-js/shared/parser/flow';

type AgentflowLabelNode = FlowLabelNode;

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

export type AgentflowStatementNode = FlowStatement<
  AgentflowFlow | AgentflowGlobal | AgentflowConnectorStmt
>;
export interface AgentflowDocument extends AstNode<'Document'> {
  children: AgentflowStatementNode[];
}
