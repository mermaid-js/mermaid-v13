// Test inputs for the ported router and post-processing specs, which v12 wrote as `LayoutData`
// literals with placed nodes and routed edges: the engine's internal data (`layoutData.ts`) from
// node and edge literals, with what v12's literals left out filled in.
import type { Dir } from '../../types.ts';
import type { Edge, LayoutData, Node } from '../layoutData.ts';

export type NodeInput = Partial<Node> & { id: string };
export type EdgeInput = Partial<Edge> & { start: string; end: string };

/** A node: not a group unless it says so. */
export const node = (n: NodeInput): Node => ({ isGroup: false, ...n });

/** An edge: id `<start>-><end>` unless it has one. */
export const edge = (e: EdgeInput): Edge => ({ id: `${e.start}->${e.end}`, ...e });

/** Internal data for placed `nodes` and `edges`, laid out `direction` with v12's spacing. */
export function internalData(
  nodes: readonly NodeInput[],
  edges: readonly EdgeInput[],
  direction: Dir = 'TB'
): LayoutData {
  return {
    nodes: nodes.map(node),
    edges: edges.map(edge),
    direction,
    config: { flowchart: { nodeSpacing: 40, rankSpacing: 100 }, swimlane: {} },
  };
}
