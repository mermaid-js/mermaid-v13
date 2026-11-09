// Ported from v12 `swimlanes/__tests__/nestedGroupSizing.spec.ts` (c9b12739f), through the engine
// on `LayoutGraph` inputs. Changed: a nested group grows by its own padding on each side (its
// `LayoutGroup.padding`), where v12 split one number between the two sides.
import { describe, expect, it } from 'vitest';
import type { Dir } from '../../types.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

const GROUP_PADDING = 8;

// Two steps in the Sales lane, either directly in it or inside an Intake subgraph.
function salesLane(direction: Dir, nested: boolean) {
  const graph = layoutGraph({
    direction,
    lanes: { L1: nested ? [] : ['A', 'B'] },
    ...(nested ? { nested: { G1: ['L1', ['A', 'B']] } } : {}),
    edges: [['A', 'B']],
    size: { width: 100, height: 40 },
    spacing: { node: 50, rank: 50 },
    padding: GROUP_PADDING,
  });
  return swimlaneLayout(graph).groups.get('L1')!;
}

describe.each(['LR', 'RL'] as const)('%s: a lane holding a nested subgraph', (direction) => {
  it('is as much larger than the same lane without it as the group pads', () => {
    const plain = salesLane(direction, false);
    const nested = salesLane(direction, true);
    expect(nested.width - plain.width).toBe(2 * GROUP_PADDING);
    expect(nested.height - plain.height).toBe(2 * GROUP_PADDING);
  });
});

describe('TB: a group holding two groups that hold the nodes', () => {
  // Without pools (D531) the outer group is the lane and the inner ones are boxes in it.
  const graph = layoutGraph({
    lanes: { P: [] },
    nested: { L1: ['P', ['A']], L2: ['P', ['B']] },
    edges: [['A', 'B']],
    size: { width: 100, height: 40 },
    spacing: { node: 50, rank: 50 },
    padding: GROUP_PADDING,
  });
  const model = swimlaneLayout(graph);

  it('draws the outer group with a size', () => {
    const outer = model.groups.get('P')!;
    expect(outer.width).toBeGreaterThan(0);
    expect(outer.height).toBeGreaterThan(0);
  });

  it('draws the outer group around both inner ones', () => {
    const outer = model.groups.get('P')!;
    for (const id of ['L1', 'L2']) {
      const inner = model.groups.get(id)!;
      expect(outer.y - outer.height / 2).toBeLessThanOrEqual(inner.y - inner.height / 2);
      expect(outer.y + outer.height / 2).toBeGreaterThanOrEqual(inner.y + inner.height / 2);
    }
  });
});
