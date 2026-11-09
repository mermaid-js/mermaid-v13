// Self-loops (v13, `selfLoops.ts`): v12's router skips them, so each gets a right-angled loop off
// its node after post-processing. A labelled loop leaves the side facing its label and runs
// through the label's centre (#595, from T0a's review: the label sat beside a detached loop).
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModelEdge, Point, RoutePoint } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';
import { swimlaneGateIssues } from './ddltGates.ts';

const LABEL = { width: 30, height: 16 };

const graphOf = (direction: Dir, label: boolean) =>
  layoutGraph({
    direction,
    lanes: { s1: ['A', 'B'] },
    edges: [label ? ['A', 'A', LABEL] : ['A', 'A'], ['A', 'B']],
    size: { width: 60, height: 40 },
  });

/** Whether `p` lies on one of the route's segments. */
function onRoute(e: LayoutModelEdge, p: Point): boolean {
  return e.points.slice(1).some((b, i) => {
    const a = e.points[i]!;
    const within = (v: number, s: number, t: number) =>
      v >= Math.min(s, t) - 1e-6 && v <= Math.max(s, t) + 1e-6;
    return within(p.x, a.x, b.x) && within(p.y, a.y, b.y);
  });
}

describe.each(['TB', 'BT', 'LR', 'RL'] as const)('%s', (direction) => {
  it('routes a labelled self-loop through its label, off the side facing it', () => {
    const graph = graphOf(direction, true);
    const model = swimlaneLayout(graph);
    const loop = model.edges.get('e0')!;
    const a = model.nodes.get('A')!;
    expect(loop.points).toHaveLength(4);
    expect(loop.ports.source).toBe(loop.ports.target);
    expect(onRoute(loop, loop.label!)).toBe(true);
    // The far leg is the one through the label; both legs keep clear of the label's box.
    const [p0, p1, p2, p3] = loop.points as [RoutePoint, RoutePoint, RoutePoint, RoutePoint];
    expect([p0, p3].every((p) => Math.abs(p.x - a.x) <= a.width / 2 + 1e-6)).toBe(true);
    expect([p0, p3].every((p) => Math.abs(p.y - a.y) <= a.height / 2 + 1e-6)).toBe(true);
    expect(onRoute({ ...loop, points: [p1, p2] }, loop.label!)).toBe(true);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });

  it('loops an unlabelled self-loop off the right side of its node', () => {
    const graph = graphOf(direction, false);
    const model = swimlaneLayout(graph);
    const loop = model.edges.get('e0')!;
    const a = model.nodes.get('A')!;
    expect(loop.ports).toEqual({ source: 'right', target: 'right' });
    expect(loop.points[0]!.x).toBeCloseTo(a.x + a.width / 2);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });
});
