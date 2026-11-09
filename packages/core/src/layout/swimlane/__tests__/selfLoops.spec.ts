// Self-loops (v13, `selfLoops.ts`): v12's router skips them, so each gets a right-angled loop off
// its node after post-processing. A labelled loop leaves the side facing its label and runs
// through the label's centre (#595, from T0a's review: the label sat beside a detached loop); an
// unlabelled one takes a free face across the flow.
import { describe, expect, it } from 'vitest';
import type { Dir, LayoutModelEdge, Point, RoutePoint } from '../../types.ts';
import { validateLayout } from '../../validate.ts';
import { swimlaneLayout } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';
import { swimlaneGateIssues } from './ddltGates.ts';
import { internalData } from './internalData.ts';
import { routeSelfLoops } from '../selfLoops.ts';

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

  it('loops an unlabelled self-loop off a free face across the flow, never its way out', () => {
    const graph = graphOf(direction, false);
    const model = swimlaneLayout(graph);
    const loop = model.edges.get('e0')!;
    const a = model.nodes.get('A')!;
    const side = direction === 'TB' || direction === 'BT' ? 'right' : 'bottom';
    expect(loop.ports).toEqual({ source: side, target: side });
    if (side === 'right') expect(loop.points[0]!.x).toBeCloseTo(a.x + a.width / 2);
    else expect(loop.points[0]!.y).toBeCloseTo(a.y + a.height / 2);
    expect(validateLayout(graph, model)).toEqual([]);
    expect(swimlaneGateIssues(graph, model)).toEqual([]);
  });
});

describe('a self-loop beside busy faces', () => {
  it('leaves the face another edge ends on for the opposite one', () => {
    const data = internalData(
      [
        { id: 'A', x: 0, y: 0, width: 60, height: 40 },
        { id: 'C', x: 200, y: 0, width: 60, height: 40 },
      ],
      [
        { id: 'loop', start: 'A', end: 'A' },
        {
          id: 'out',
          start: 'A',
          end: 'C',
          points: [
            { x: 30, y: 0 },
            { x: 170, y: 0 },
          ],
        },
      ]
    );
    routeSelfLoops(data);
    expect(data.edges[0]!.points!.every((p) => p.x <= -30)).toBe(true);
  });

  it('keeps a label where the phases put it when the centre line is taken, and reaches it', () => {
    const data = internalData(
      [
        { id: 'A', x: 0, y: 0, width: 60, height: 40 },
        { id: 'L', isEdgeLabel: true, x: 80, y: 40, width: 30, height: 16 },
        { id: 'X', x: 80, y: 0, width: 30, height: 30 },
      ],
      [{ id: 'loop', start: 'A', end: 'A', labelNodeId: 'L' }]
    );
    routeSelfLoops(data);
    const label = data.nodes[1]!;
    expect([label.x, label.y]).toEqual([80, 40]);
    const pts = data.edges[0]!.points!;
    const reached = pts.slice(1).some((b, i) => {
      const a = pts[i]!;
      return (
        Math.min(a.x, b.x) <= 80 &&
        Math.max(a.x, b.x) >= 80 &&
        Math.min(a.y, b.y) <= 40 &&
        Math.max(a.y, b.y) >= 40
      );
    });
    expect(reached).toBe(true);
    expect([pts[0]!.x, pts.at(-1)!.x]).toEqual([30, 30]);
  });
});
