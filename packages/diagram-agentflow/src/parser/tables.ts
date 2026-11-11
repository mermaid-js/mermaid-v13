/**
 * The agentflow parser's tables (`parser.ts`): the flow family's (`@mermaid-js/shared/parser/flow`)
 * for agentflow's token kinds, with what agentflow's grammar adds (`flow`, `global` and
 * `connector`, a comment token that ends a statement), and the shape of an open block. Built
 * once at module scope.
 */
import type { Dir } from '@mermaid-js/core/layout';
import type { ParseState, Range } from '@mermaid-js/core/parser-kit';
import { flowTables } from '@mermaid-js/shared/parser/flow';
import type { FlowDocItem, FlowShapeData } from '@mermaid-js/shared/parser/flow';
import type { AgentflowLabelNode, AgentflowStatementNode } from './ast.ts';
import { T } from './tokens.ts';

const LAYOUT_DIRS: Readonly<Record<string, Dir>> = {
  TB: 'TB',
  TD: 'TB',
  BT: 'BT',
  LR: 'LR',
  RL: 'RL',
};

/**
 * The direction a model direction (the diagram's or a flow's, as v12 kept it) is drawn in: `TD`
 * is `TB`; v12's `BR` is none (the diagram draws `TB`, a flow its parent's). The one reading.
 */
export const layoutDir = (dir: string | undefined): Dir | undefined =>
  dir !== undefined && Object.hasOwn(LAYOUT_DIRS, dir) ? LAYOUT_DIRS[dir] : undefined;

/**
 * The family's tables for agentflow: a `%%` comment is a statement end (jison's `separator`),
 * and recovery resumes at one.
 */
export const TABLES = /* @__PURE__ */ flowTables(T, {
  keywords: [T.Flow, T.Global, T.Connector],
  separators: [T.Comment],
  names: {
    separator: 'a line break, `;` or a comment',
    header: '`agentflow-beta`',
    statement: 'a statement such as `flow`, `connector`, `style` or `classDef`',
    data: 'metadata',
  },
  hints: {
    [T.Connector]:
      'write it as `connector <id>`, `connector <id>[title]` or `connector <id>@{ … }`, on its own line',
  },
  linkHint: 'agentflow links are written `-->`, `--x` or `-.-`',
});

/**
 * What the parser reads past besides spaces: comments inside labels and past `maxTextSize`
 * (a `%%` comment elsewhere is a token), directives, and the `click` keyword (jison has no
 * token for it, so `click` heads no statement: the node id after it does).
 */
export const READ_PAST = TABLES.READ_PAST;

const { LINE_END } = TABLES;
export const AFTER_FLOW_ID: readonly number[] = [T.SQS, T.ShapeData, ...LINE_END];
export const AFTER_TITLE: readonly number[] = [T.ShapeData, ...LINE_END];
export const CONNECTOR_SPACE: readonly number[] = [T.Space];

/** An open `flow` or `global` block. */
export interface Frame {
  kind: 'flow' | 'global';
  /** The header had an error, already reported: a missing `end` is part of it. */
  failed: boolean;
  id: AgentflowLabelNode | undefined;
  title: AgentflowLabelNode | undefined;
  data: FlowShapeData | undefined;
  list: FlowDocItem[];
  collect: boolean;
  start: number;
  opener: Range;
  span: ReturnType<ParseState['beginStatement']>;
  children: AgentflowStatementNode[];
  outer: AgentflowStatementNode[];
}
