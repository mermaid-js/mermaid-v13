// The `swimlane` engine (D531–D536): `LayoutGraph` → internal `LayoutData` → v12's phases →
// `LayoutModel`. Kept apart from `index.ts` so specs reach it without the subpath.
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { toLayoutData, toLayoutModel } from './adapter.ts';
import { createEdgeLabelNodes } from './edgeLabelNodes.ts';
import { prepareLayoutForSwimlanes } from './helpers.ts';
import type { LayoutData, Node, SwimlaneTuning } from './layoutData.ts';
import { runSwimlaneLayoutCore } from './layoutCore.ts';

/**
 * Nested groups with nothing in them. v12 leaves them at the origin with no size; here each
 * takes part in the layout as a node the size of its padding and title, so it gets a place of
 * its own in its lane, and is a group again afterwards.
 */
function emptyNestedGroups(data: LayoutData): Node[] {
  const parents = new Set(data.nodes.map((n) => n.parentId));
  const empty = data.nodes.filter((n) => n.isGroup && n.parentId && !parents.has(n.id));
  for (const g of empty) {
    const pad = g.paddingBox ?? { top: 0, right: 0, bottom: 0, left: 0 };
    g.isGroup = false;
    g.width = pad.left + pad.right + (g.titleSize?.width ?? 0);
    g.height = Math.max(pad.top, g.titleSize?.height ?? 0) + pad.bottom;
  }
  return empty;
}

/** v12's `prepareSwimlaneLayout` and `runSwimlaneLayoutCore`, on data built from `graph`. */
export function runSwimlane(graph: LayoutGraph, tuning?: Readonly<SwimlaneTuning>): LayoutData {
  const data = toLayoutData(graph, tuning);
  const empty = emptyNestedGroups(data);
  prepareLayoutForSwimlanes(data);
  const withLabels = createEdgeLabelNodes(data);
  data.nodes = withLabels.nodes;
  data.edges = withLabels.edges;
  runSwimlaneLayoutCore(data);
  for (const g of empty) g.isGroup = true;
  return data;
}

export function swimlaneLayout(graph: LayoutGraph, tuning?: Readonly<SwimlaneTuning>): LayoutModel {
  return toLayoutModel(graph, runSwimlane(graph, tuning));
}
