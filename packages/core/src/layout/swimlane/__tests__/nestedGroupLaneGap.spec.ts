// Ported from the v12 change mermaid-js/mermaid#8826 (966304624), `nestedGroupLaneGap.spec.ts`,
// through the engine on a `LayoutGraph`.
import { describe, expect, it } from 'vitest';
import type { Dir } from '../../types.ts';
import { topLaneGap } from '../helpers.ts';
import type { Node } from '../layoutData.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

const TOLERANCE = 0.5;
const SPACINGS = [10, 20];
const PADDINGS = [8, 20, 40, 60];

/** Lane A holds `a` inside `depth` nested groups, so the group's box reaches the lane edge. */
const graphOf = (direction: Dir, depth: number, nodeSpacing: number, padding = 20) =>
  layoutGraph({
    direction,
    lanes: { L1: [], L2: ['b'] },
    nested: Object.fromEntries(
      Array.from({ length: depth }, (_, i): [string, [string, string[]]] => [
        `G${i}`,
        [i === 0 ? 'L1' : `G${i - 1}`, i === depth - 1 ? ['a'] : []],
      ])
    ),
    edges: [['a', 'b']],
    size: { width: 100, height: 40 },
    spacing: { node: nodeSpacing, rank: 50 },
    padding,
    titles: true,
  });

/** The room between the two lanes across the flow; negative when they overlap. */
const seam = (direction: Dir, depth: number, nodeSpacing: number, padding?: number) => {
  const { groups } = swimlaneLayout(graphOf(direction, depth, nodeSpacing, padding));
  const [left, right] = ['L1', 'L2'].map((id) => groups.get(id)!).sort((p, q) => p.x - q.x);
  return right!.x - right!.width / 2 - (left!.x + left!.width / 2);
};

describe.each(['TB', 'BT'] as const)('%s: a nested group at a lane edge', (direction) => {
  describe.each([1, 2])('nesting depth %d', (depth) => {
    it.each(SPACINGS)('nodeSpacing %d: the lanes do not overlap', (nodeSpacing) => {
      expect(seam(direction, depth, nodeSpacing)).toBeGreaterThanOrEqual(-TOLERANCE);
    });
  });

  it.each(PADDINGS)('lane padding %d: the lanes do not overlap', (padding) => {
    expect(seam(direction, 1, 10, padding)).toBeGreaterThanOrEqual(-TOLERANCE);
  });
});

describe('topLaneGap on groups whose parents form a cycle', () => {
  it('ends, and counts no inset for a group that never reaches a lane', () => {
    const group = (id: string, parentId: string): Node => ({ id, isGroup: true, parentId });
    const lane: Node = { id: 'L1', isGroup: true };
    expect(topLaneGap([lane, group('X', 'Y'), group('Y', 'X')], 10)).toBe(topLaneGap([lane], 10));
  });
});
