// Ported from v12 `swimlanes/__tests__/nestedGroupInLane.spec.ts` (c9b12739f), through the engine
// on a `LayoutGraph`.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModelNode } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

// Sales (L1) holds an Intake subgraph (G1: A, B) and C; Warehouse (L2) holds D, E.
const graphOf = (direction: Dir) =>
  layoutGraph({
    direction,
    lanes: { L1: ['C'], L2: ['D', 'E'] },
    nested: { G1: ['L1', ['A', 'B']] },
    edges: [
      ['A', 'B'],
      ['D', 'E'],
      ['B', 'C'],
      ['C', 'D'],
    ],
    size: { width: 100, height: 40 },
    spacing: { node: 50, rank: 50 },
    padding: 8,
    titles: true,
  });

const box = (b: LayoutModelNode) => ({
  left: b.x - b.width / 2,
  right: b.x + b.width / 2,
  top: b.y - b.height / 2,
  bottom: b.y + b.height / 2,
});

describe.each(['TB', 'BT', 'LR', 'RL'] as const)('%s: a subgraph nested in a lane', (direction) => {
  const graph = graphOf(direction);
  const model = swimlaneLayout(graph);

  it('is framed around the nodes it holds', () => {
    const group = box(model.groups.get('G1')!);
    for (const id of ['A', 'B']) {
      const member = box(model.nodes.get(id)!);
      expect(group.left).toBeLessThanOrEqual(member.left);
      expect(group.right).toBeGreaterThanOrEqual(member.right);
      expect(group.top).toBeLessThanOrEqual(member.top);
      expect(group.bottom).toBeGreaterThanOrEqual(member.bottom);
    }
  });

  it('sits inside the lane that holds it', () => {
    const group = box(model.groups.get('G1')!);
    const lane = box(model.groups.get('L1')!);
    expect(lane.left).toBeLessThanOrEqual(group.left);
    expect(lane.right).toBeGreaterThanOrEqual(group.right);
    expect(lane.top).toBeLessThanOrEqual(group.top);
    expect(lane.bottom).toBeGreaterThanOrEqual(group.bottom);
  });

  it('keeps its title room on top, above its members', () => {
    const group = box(model.groups.get('G1')!);
    const top = Math.min(...['A', 'B'].map((id) => box(model.nodes.get(id)!).top));
    expect(top - group.top).toBeCloseTo(8, 6);
    expect(model.groups.get('G1')!.title.y).toBeCloseTo(group.top + 4, 6);
  });

  it('is a valid layout', () => {
    expect(validateLayout(graph, model)).toEqual([]);
  });
});
