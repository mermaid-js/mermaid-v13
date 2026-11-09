// Ported from v12 `swimlanes/layoutCore.ts` at upstream `c9b12739f` (D532). Changed: spacing and
// tuning come from the adapter's `LayoutData.config` (`graph.spacing`, `ctx.config.swimlane`);
// the lane order the phases used is kept on `laneOrder` for the adapter; the curve choice
// (`basis` to `rounded`) is flowchart's (T1, the model has no curve); `validateSwimlanesLayout`
// only logged in v12, so it runs from the specs (`__tests__/ddlt.spec.ts`), not here.
import type { LayoutData } from './layoutData.ts';
import { postProcessSwimlaneLayout } from './postProcessing.ts';
import { toGraphView, writeBackToLayoutData } from './helpers.ts';
import { sugiyamaLayout } from './pipeline.ts';
import { resolveTopLaneOrder } from './phase2.options.ts';
import { routeEdgesOrthogonal } from './orthogonalRouter/router.ts';
import { routeSelfLoops } from './selfLoops.ts';

export type SwimlaneDirection = 'TB' | 'LR' | 'BT' | 'RL';

/**
 * Pure swimlane layout core: ranks, orders and places the nodes, sizes the lanes, routes the
 * edges at right angles, turns the TB layout to the diagram's direction and cleans the routes up.
 * It mutates `data4Layout`.
 */
export function runSwimlaneLayoutCore(data4Layout: LayoutData): SwimlaneDirection {
  const g = toGraphView(data4Layout);
  const nodeGap = data4Layout.config.flowchart.nodeSpacing;
  const layerGap = data4Layout.config.flowchart.rankSpacing;
  const ignoreCrossLaneEdges = data4Layout.config.swimlane.ignoreCrossLaneEdges ?? true;
  const optimizeRanksByCrossings = data4Layout.config.swimlane.optimizeRanksByCrossings ?? true;
  const automaticLaneOrdering = data4Layout.config.swimlane.automaticLaneOrdering ?? false;
  const direction = data4Layout.direction;

  const { ordered, coordinates, laneOrder } = sugiyamaLayout(g, {
    nodeGap,
    layerGap,
    ignoreCrossLaneEdges,
    optimizeRanksByCrossings,
    automaticLaneOrdering,
    direction,
  });
  writeBackToLayoutData(g, ordered, coordinates, { nodeGap, layerGap });
  data4Layout.laneOrder = resolveTopLaneOrder(g, laneOrder);

  // The layout phases above position nodes only; they do not emit edge routing.
  // Reset any edge points carried on the input so routeEdgesOrthogonal below is
  // the single source of truth for swimlane edge geometry.
  for (const edge of data4Layout.edges) {
    delete edge.points;
  }
  routeEdgesOrthogonal(data4Layout, direction);

  postProcessSwimlaneLayout(data4Layout, direction);
  // v12's router skips self-loops; v13's model routes every edge.
  routeSelfLoops(data4Layout);

  return direction;
}
