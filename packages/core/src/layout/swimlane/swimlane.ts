// The `swimlane` engine (D531–D536): `LayoutGraph` → internal `LayoutData` → v12's phases →
// `LayoutModel`. Kept apart from `index.ts` so specs reach it without the subpath.
import type { LayoutGraph, LayoutModel } from '../types.ts';
import { laneOrderOf, toLayoutData, toLayoutModel } from './adapter.ts';
import { createEdgeLabelNodes } from './edgeLabelNodes.ts';
import { prepareLayoutForSwimlanes } from './helpers.ts';
import type { LayoutData, SwimlaneTuning } from './layoutData.ts';
import { runSwimlaneLayoutCore } from './layoutCore.ts';

/** v12's `prepareSwimlaneLayout` and `runSwimlaneLayoutCore`, on data built from `graph`. */
export function runSwimlane(graph: LayoutGraph, tuning?: Readonly<SwimlaneTuning>): LayoutData {
  const data = toLayoutData(graph, tuning);
  prepareLayoutForSwimlanes(data);
  const withLabels = createEdgeLabelNodes(data);
  data.nodes = withLabels.nodes;
  data.edges = withLabels.edges;
  runSwimlaneLayoutCore(data);
  return data;
}

export function swimlaneLayout(graph: LayoutGraph, tuning?: Readonly<SwimlaneTuning>): LayoutModel {
  const data = runSwimlane(graph, tuning);
  return toLayoutModel(graph, data, laneOrderOf(data, graph));
}
