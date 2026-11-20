// The engine's internal, mutable data: the subset of v12's `LayoutData` (upstream `c9b12739f`,
// `rendering-util/types.ts`) that the swimlane phases, router and post-processing read and write.
// `adapter.ts` builds it from a `LayoutGraph` and writes a `LayoutModel` back from it, so the
// ported files keep v12's shape and names (D532) and upstream fixes come over by hand.
import type { Box, Dir, Point, Size } from '../types.ts';

/**
 * A node, a group (lane or nested box), or an edge-label node. `x`/`y` are centres. A group's
 * `padding` is v12's single number; `paddingBox` is the `LayoutGroup`'s, which a nested group's
 * box is grown by so its title has room.
 */
export interface Node {
  id: string;
  isGroup: boolean;
  parentId?: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  padding?: number;
  paddingBox?: Box;
  /** A group's measured title, from `LayoutGroup.title`. */
  titleSize?: Size;
  isEdgeLabel?: boolean;
  isDummy?: boolean;
  edgeStart?: string;
  edgeEnd?: string;
  /** Rank and place in it, written back after ordering. */
  layer?: number;
  order?: number;
  /** A lane's title band, which the engine reserves inside the lane box (D536), as v12's `groupTitleRect`. */
  groupTitleRect?: Box;
  swimlaneContentTop?: number;
  direction?: Dir;
  /** `swimlane` on a lane, as v12 marks it. */
  shape?: string;
}

/**
 * An edge. `label` is the measured label size (v12 held its text); `createEdgeLabelNodes` moves it
 * onto a label node and stamps `labelNodeId`. `isLayoutOnly` edges only steer ranking.
 * `points` is the route, which the router (T0b) writes and post-processing reshapes.
 */
export interface Edge {
  id: string;
  start: string;
  end: string;
  label?: Size;
  labelNodeId?: string;
  isLayoutOnly?: boolean;
  points?: Point[];
  curve?: string;
}

/** The tuning v12 read from `config.swimlane`. */
export interface SwimlaneTuning {
  ignoreCrossLaneEdges?: boolean;
  optimizeRanksByCrossings?: boolean;
  automaticLaneOrdering?: boolean;
}

export interface LayoutData {
  nodes: Node[];
  edges: Edge[];
  direction: Dir;
  /**
   * The lanes across the flow, written by `runSwimlaneLayoutCore`: the lanes with nodes in the
   * order the phases placed them (source order, or the automatic order), and each empty lane
   * beside the lanes declared next to it.
   */
  laneOrder?: string[];
  config: {
    /** From `graph.spacing`: `node` and `rank`. */
    flowchart: { nodeSpacing: number; rankSpacing: number };
    swimlane: SwimlaneTuning;
  };
}
