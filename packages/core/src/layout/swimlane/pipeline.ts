// Ported from v12 `swimlanes/pipeline.ts` at upstream `c9b12739f` (D532).
import type { Graph, Layering, OrderedLayers, Coordinates, Edge } from './helpers.ts';
import { normalizeGraph } from './phase0.helpers.ts';
import { removeCycles_DFS } from './phase1.cycles.ts';

import { assignLayers_Gravity } from './phase2.gravity.ts';
import { assignLayers_LaneAwareCompact } from './phase2.laneAwareCompact.ts';
import { makeProperLayering } from './phase2.dummies.ts';
import { orderLayers } from './phase3.ordering.ts';
import { assignCoordinates } from './phase4.coordinates.ts';
import { LAYERING } from './config.ts';
import { AUTOMATIC_LANE_ORDERING_RESTARTS, optimizeTopLaneOrder } from './laneOrdering.ts';

export interface LayoutOptions {
  // Layering
  compactSingleInput?: boolean; // default true for compact swimlanes
  ignoreCrossLaneEdges?: boolean;
  optimizeRanksByCrossings?: boolean;
  automaticLaneOrdering?: boolean;
  // Coordinates
  layerGap?: number;
  nodeGap?: number;
  // Direction (for proper spacing calculation)
  direction?: 'TB' | 'LR' | 'BT' | 'RL';
}

export interface LayoutResult {
  acyclic: Graph;
  reversed: Edge[];
  layering: Layering;
  ordered: OrderedLayers;
  coordinates: Coordinates;
}

export function sugiyamaLayout(g: Graph, opts?: LayoutOptions): LayoutResult {
  const ignoreCrossLaneEdges = opts?.ignoreCrossLaneEdges ?? true;
  const optimizeRanksByCrossings = opts?.optimizeRanksByCrossings ?? true;
  const g0 = normalizeGraph(g);
  const laneOrder = opts?.automaticLaneOrdering
    ? optimizeTopLaneOrder(g0, { restarts: AUTOMATIC_LANE_ORDERING_RESTARTS })
    : undefined;

  // Phase 1: cycle removal
  const cycleRes = removeCycles_DFS(g0);
  const gAcyclic = cycleRes.acyclic;

  // Phase 2: layering
  const layering = ignoreCrossLaneEdges
    ? assignLayers_LaneAwareCompact(gAcyclic, {
        compactSingleInput: opts?.compactSingleInput ?? LAYERING.DEFAULT_COMPACT_SINGLE_INPUT,
        ignoreCrossLaneEdges: true,
        direction: opts?.direction,
      })
    : assignLayers_Gravity(gAcyclic, {
        compactSingleInput: opts?.compactSingleInput ?? LAYERING.DEFAULT_COMPACT_SINGLE_INPUT,
        ignoreCrossLaneEdges: false,
        optimizeRanksByCrossings,
      });
  const { layering: properLayering, graphWithDummies } = makeProperLayering(layering, gAcyclic);
  // Phase 3: ordering
  const ordered = orderLayers(properLayering, graphWithDummies, { laneOrder });

  // Phase 4: coordinates
  const coordinates = assignCoordinates(ordered, graphWithDummies, {
    layerGap: opts?.layerGap,
    nodeGap: opts?.nodeGap,
    direction: opts?.direction,
    laneOrder,
  });

  return {
    acyclic: gAcyclic,
    reversed: cycleRes.reversed,
    layering: properLayering,
    ordered,
    coordinates,
  };
}
