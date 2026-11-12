// A lane title longer than its lane is across the flow (v13, `laneFit.ts` `fitLanesToTitles`):
// v12 let it run past the lane; here the lane grows to hold it, content centred.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModel, LayoutModelGroup } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

// `titles: true` makes each title 8px per character of its lane id.
const LONG = 'AVeryLongLaneTitleThatOutrunsItsNodes';

const graphOf = (direction: Dir) =>
  layoutGraph({
    direction,
    lanes: { A: ['a1', 'a2'], [LONG]: ['b1'], C: ['c1'] },
    edges: [
      ['a1', 'a2'],
      ['a2', 'b1'],
      ['b1', 'c1'],
      ['a1', 'c1'],
    ],
    size: { width: 60, height: 30 },
    spacing: { node: 40, rank: 60 },
    titles: true,
  });

const across = (direction: Dir) => (direction === 'LR' || direction === 'RL' ? 'y' : 'x');
const spanOf = (g: LayoutModelGroup, axis: 'x' | 'y') => {
  const half = (axis === 'x' ? g.width : g.height) / 2;
  return { lo: g[axis] - half, hi: g[axis] + half };
};

describe.each(['TB', 'BT', 'LR', 'RL'] as const)('%s', (direction) => {
  const graph = graphOf(direction);
  const model: LayoutModel = swimlaneLayout(graph);
  const axis = across(direction);

  it('makes the lane at least its title plus 20 each side across the flow', () => {
    const lane = model.groups.get(LONG)!;
    const { lo, hi } = spanOf(lane, axis);
    expect(hi - lo).toBeGreaterThanOrEqual(8 * LONG.length + 40 - 1e-6);
  });

  it('keeps the lane content centred, the lanes apart and the layout valid', () => {
    const lane = model.groups.get(LONG)!;
    const b1 = model.nodes.get('b1')!;
    expect(b1[axis]).toBeCloseTo(lane[axis], 6);
    const spans = ['A', LONG, 'C']
      .map((id) => spanOf(model.groups.get(id)!, axis))
      .sort((p, q) => p.lo - q.lo);
    for (let i = 1; i < spans.length; i++)
      expect(spans[i]!.lo).toBeGreaterThanOrEqual(spans[i - 1]!.hi - 1e-6);
    expect(validateLayout(graph, model)).toEqual([]);
  });

  it('keeps every route right-angled', () => {
    for (const [, e] of model.edges) {
      for (let i = 1; i < e.points.length; i++) {
        const [p, q] = [e.points[i - 1]!, e.points[i]!];
        expect(Math.min(Math.abs(p.x - q.x), Math.abs(p.y - q.y))).toBeLessThan(1e-6);
      }
    }
  });
});
