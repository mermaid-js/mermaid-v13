// Ported from v12 `swimlanes/__tests__/siblingFaces.spec.ts` (c9b12739f). Changed: the fixture
// is its v13 capture laid out with v12's viewer sizes (`viewerSizedLayout.ts`), synchronously.
import { describe, expect, it } from 'vitest';
import { faceAxis, type Box } from './faceGeometry.ts';
import { VIEWER_SIZES_QUERY_PROCESS } from './viewerMeasuredSizes.ts';
import { layOutFixture } from './viewerSizedLayout.ts';

// A rail closer than this to a node it does not join counts as touching it.
const RAIL_CLEARANCE = 4;

describe('edges that leave one node', () => {
  it('query-process: every edge leaves the diamond E at a vertex, not beside it', () => {
    const layout = layOutFixture('query-process', VIEWER_SIZES_QUERY_PROCESS);
    const diamond = layout.nodes.find((n) => n.id === 'E') as unknown as Box;
    const leaving = layout.edges.filter((e) => e.start === 'E' && e.points?.length);
    expect(leaving.length).toBeGreaterThan(1);
    for (const edge of leaving) {
      expect(faceAxis(diamond, edge.points![0]!), `${edge.id} starts off a vertex`).toBeDefined();
    }
  });

  it('query-process: no edge runs along or through a node it does not join', () => {
    const layout = layOutFixture('query-process', VIEWER_SIZES_QUERY_PROCESS);
    const boxes = layout.nodes.filter((n) => !n.isGroup && !n.isEdgeLabel);
    const touching: string[] = [];
    for (const edge of layout.edges) {
      const points = edge.points ?? [];
      for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1]!, points[i]!];
        for (const node of boxes) {
          if (node.id === edge.start || node.id === edge.end) {
            continue;
          }
          const halfW = (node.width ?? 0) / 2 + RAIL_CLEARANCE;
          const halfH = (node.height ?? 0) / 2 + RAIL_CLEARANCE;
          const overlapsX =
            Math.min(a.x, b.x) < node.x! + halfW && Math.max(a.x, b.x) > node.x! - halfW;
          const overlapsY =
            Math.min(a.y, b.y) < node.y! + halfH && Math.max(a.y, b.y) > node.y! - halfH;
          if (overlapsX && overlapsY) {
            touching.push(`${edge.id} touches ${node.id}`);
          }
        }
      }
    }
    expect(touching).toEqual([]);
  });
});
