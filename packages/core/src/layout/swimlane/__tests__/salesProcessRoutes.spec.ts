// Ported from v12 `swimlanes/__tests__/salesProcessRoutes.spec.ts` (c9b12739f). Changed: v12 had
// no sizes file for sales-process and laid it out from the viewer's sizes alone; here it is its
// v13 capture with those sizes laid over (`viewerSizedLayout.ts`), synchronously.
import { describe, expect, it } from 'vitest';
import type { LayoutData } from '../layoutData.ts';
import { EDGE_ROUTING } from '../config.ts';
import { faceAxis, type Box } from './faceGeometry.ts';
import { distance, routeTouches, type Pt } from './routeTouches.ts';
import { VIEWER_SIZES_SALES_PROCESS } from './viewerMeasuredSizes.ts';
import { layOutMeasured } from './viewerSizedLayout.ts';

/**
 * Which face of `node` the point `p` lands on: the axis of the face plus the side of the centre
 * along that axis. A point off the boundary belongs to no face.
 */
function faceKey(node: Box, p: Pt): string | undefined {
  const axis = faceAxis(node, p);
  if (axis === undefined) {
    return undefined;
  }
  return `${axis}:${Math.sign(axis === 'horizontal' ? p.x - node.x : p.y - node.y)}`;
}

function endsOn(layout: LayoutData, nodeId: string) {
  const node = layout.nodes.find((n) => n.id === nodeId)! as Box;
  return layout.edges
    .filter((e) => (e.end === nodeId || e.start === nodeId) && e.points?.length)
    .map((e) => ({ id: e.id, end: e.end === nodeId ? e.points!.at(-1)! : e.points![0]! }))
    .map((e) => ({ ...e, face: faceKey(node, e.end) ?? `off the boundary: ${e.id}` }));
}

describe('the face an endpoint lands on', () => {
  const node: Box = { x: 100, y: 50, width: 80, height: 40 };

  it('puts two points on one top face together, whichever side of the centre they are', () => {
    const [left, right] = [
      { x: 80, y: 30 },
      { x: 120, y: 30 },
    ];
    expect(Math.sign(left.x - node.x)).not.toBe(Math.sign(right.x - node.x));
    expect(faceKey(node, left)).toBe(faceKey(node, right));
  });

  it('keeps a top face apart from the left face although both lie left of the centre', () => {
    const [top, side] = [
      { x: 80, y: 30 },
      { x: 60, y: 50 },
    ];
    expect(Math.sign(top.x - node.x)).toBe(Math.sign(side.x - node.x));
    expect(faceKey(node, top)).not.toBe(faceKey(node, side));
  });

  it('tells the top face from the bottom face', () => {
    expect(faceKey(node, { x: 100, y: 30 })).not.toBe(faceKey(node, { x: 100, y: 70 }));
  });

  it('gives a point off the boundary no face', () => {
    expect(faceKey(node, { x: 100, y: 50 })).toBeUndefined();
  });
});

describe('sales-process, laid out as the dev viewer measures it', () => {
  it('keeps arrowheads that land on one face of a node apart', () => {
    const layout = layOutMeasured('sales-process', VIEWER_SIZES_SALES_PROCESS);
    const tooClose: string[] = [];
    for (const node of layout.nodes.filter((n) => !n.isGroup && !n.isEdgeLabel)) {
      const ends = endsOn(layout, node.id);
      for (const [i, a] of ends.entries()) {
        for (const b of ends.slice(i + 1)) {
          const gap = distance(a.end, b.end);
          if (a.face === b.face && gap < EDGE_ROUTING.MIN_ARROWHEAD_SPACING) {
            tooClose.push(`${a.id} and ${b.id} end ${gap.toFixed(1)} apart on ${node.id}`);
          }
        }
      }
    }
    expect(tooClose).toEqual([]);
  });

  it('never lets the corner of one route touch another route', () => {
    const layout = layOutMeasured('sales-process', VIEWER_SIZES_SALES_PROCESS);
    expect(routeTouches(layout)).toEqual([]);
  });
});
