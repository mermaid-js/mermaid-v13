// Ported from v12 `swimlanes/lanes.ts` at upstream `c9b12739f` (D532), without pools (D531): a lane
// is a group with no parent, and everything inside it, however deep, belongs to it.
import type { Node } from './layoutData.ts';

export interface LaneModel {
  isLane: (id: string) => boolean;

  laneIdOf: (id: string) => string | null;
}

export function buildLaneModel(nodes: readonly Node[]): LaneModel {
  const byId = new Map<string, Node>();
  for (const node of nodes) {
    byId.set(node.id, node);
  }

  const lanes = new Set<string>();
  for (const node of nodes) {
    if (node.isGroup && !node.parentId) {
      lanes.add(node.id);
    }
  }

  const walk = (id: string, stopAt: Set<string>): string | null => {
    const seen = new Set<string>([id]);
    let current = byId.get(id)?.parentId;
    while (current && !seen.has(current)) {
      if (stopAt.has(current)) {
        return current;
      }
      seen.add(current);
      current = byId.get(current)?.parentId;
    }
    return null;
  };

  const laneCache = new Map<string, string | null>();
  const laneIdOf = (id: string): string | null => {
    const cached = laneCache.get(id);
    if (cached !== undefined) {
      return cached;
    }
    const lane = walk(id, lanes);
    laneCache.set(id, lane);
    return lane;
  };

  return {
    isLane: (id) => lanes.has(id),
    laneIdOf,
  };
}
