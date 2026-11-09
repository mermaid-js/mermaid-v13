// Ported from v12 `swimlanes/layoutCore.ts` at upstream `c9b12739f` (D532). Changed: spacing and
// tuning come from the adapter's `LayoutData.config` (`graph.spacing`, `ctx.config.swimlane`);
// the orthogonal router and curve choice arrive with T0b (#595), so edges leave here unrouted.
import type { LayoutData } from './layoutData.ts';
import { postProcessSwimlaneLayout } from './postProcessing.ts';
import { toGraphView, writeBackToLayoutData } from './helpers.ts';
import { sugiyamaLayout } from './pipeline.ts';

export type SwimlaneDirection = 'TB' | 'LR' | 'BT' | 'RL';

/**
 * Pure swimlane layout core: ranks, orders and places the nodes, sizes the lanes, and turns the
 * TB layout to the diagram's direction. It mutates `data4Layout`.
 */
export function runSwimlaneLayoutCore(data4Layout: LayoutData): SwimlaneDirection {
  const g = toGraphView(data4Layout);
  const nodeGap = data4Layout.config.flowchart.nodeSpacing;
  const layerGap = data4Layout.config.flowchart.rankSpacing;
  const ignoreCrossLaneEdges = data4Layout.config.swimlane.ignoreCrossLaneEdges ?? true;
  const optimizeRanksByCrossings = data4Layout.config.swimlane.optimizeRanksByCrossings ?? true;
  const automaticLaneOrdering = data4Layout.config.swimlane.automaticLaneOrdering ?? false;
  const direction = data4Layout.direction;

  const { ordered, coordinates } = sugiyamaLayout(g, {
    nodeGap,
    layerGap,
    ignoreCrossLaneEdges,
    optimizeRanksByCrossings,
    automaticLaneOrdering,
    direction,
  });
  writeBackToLayoutData(g, ordered, coordinates, { nodeGap, layerGap });

  // The layout phases above position nodes only; they do not emit edge routing.
  // Reset any edge points carried on the input so the router is the single
  // source of truth for swimlane edge geometry.
  for (const edge of data4Layout.edges) {
    delete edge.points;
  }

  postProcessSwimlaneLayout(data4Layout, direction);

  return direction;
}
