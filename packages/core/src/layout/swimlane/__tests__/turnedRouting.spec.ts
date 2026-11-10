// LR and RL route on the boxes as drawn (v13, `turnedRouting.ts`). v12 routed both in TB
// coordinates with unturned sizes and turned only LR's obstacle extents (`isLR`), so RL detours
// used a wide node's TB width and side ports landed off turned nodes (#636).
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModel } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { swimlaneGateIssues } from './ddltGates.ts';
import { layoutGraph } from './graphs.ts';

/** A wide, short node W between A and C in one lane, with A to C going round it. */
const graphOf = (direction: Dir) =>
  layoutGraph({
    direction,
    lanes: { s1: ['A', 'W', 'C'], s2: ['D'] },
    edges: [
      ['A', 'W'],
      ['W', 'C'],
      ['A', 'C'],
      ['D', 'W'],
    ],
    size: (id) => (id === 'W' ? { width: 320, height: 24 } : { width: 60, height: 40 }),
  });

/**
 * Each route, x mirrored for RL and measured from the leftmost route point (the title band stays
 * on the left in both, D536, so the drawings themselves are not mirrors).
 */
function shapes(model: LayoutModel, mirror: boolean): string[] {
  const xs = [...model.edges.values()].flatMap((e) => e.points.map((p) => (mirror ? -p.x : p.x)));
  const left = Math.min(...xs);
  return [...model.edges].map(([id, e]) => {
    const pts = e.points.map((p) => [Math.round((mirror ? -p.x : p.x) - left), Math.round(p.y)]);
    return `${id}: ${JSON.stringify(pts)}`;
  });
}

describe('LR and RL routing on drawn sizes', () => {
  it.each(['LR', 'RL'] as const)('keeps %s routes valid round a wide, short node', (direction) => {
    const graph = graphOf(direction);
    const model = swimlaneLayout(graph);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });

  it('routes RL as the mirror of LR', () => {
    const lr = swimlaneLayout(graphOf('LR'));
    const rl = swimlaneLayout(graphOf('RL'));
    expect(shapes(rl, true)).toEqual(shapes(lr, false));
  });
});
