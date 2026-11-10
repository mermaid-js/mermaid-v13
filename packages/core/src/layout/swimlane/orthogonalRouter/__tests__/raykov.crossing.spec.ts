// Ported from v12 `swimlanes/orthogonalRouter/__tests__/raykov.crossing.spec.ts` (c9b12739f). Changed: the
// layouts are the engine's internal `LayoutData`; v12's node `intersect` callbacks (the router
// never calls them) and its RAYKOV_DEBUG logging are gone.
import { describe, it, expect } from 'vitest';
import { routeEdgesOrthogonal } from '../router.ts';
import type { LayoutData } from '../../layoutData.ts';

interface Point {
  x: number;
  y: number;
}

interface RectNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TestNode extends RectNode {
  id: string;
  isGroup: boolean;
  parentId?: string;
}

interface TestEdge {
  id: string;
  start: string;
  end: string;
  type: 'normal';
  points?: Point[];
}

interface TestLayout {
  nodes: TestNode[];
  edges: TestEdge[];
  config: Record<string, unknown>;
}

/** The engine's internal data for the test layout, sharing its node and edge objects. */
function asLayout(data: TestLayout): LayoutData {
  return {
    nodes: data.nodes,
    edges: data.edges,
    direction: 'TB',
    config: { flowchart: { nodeSpacing: 40, rankSpacing: 100 }, swimlane: {} },
  };
}

function mkNode(id: string, x: number, y: number, opts?: Partial<TestNode>): TestNode {
  const width = opts?.width ?? 42.1171875;
  const height = opts?.height ?? 45;
  const base: TestNode = {
    id,
    isGroup: false,
    x,
    y,
    width,
    height,
  };
  return { ...base, ...opts };
}

function mkEdge(id: string, start: string, end: string): TestEdge {
  return { id, start, end, type: 'normal' };
}

type SegmentOrientation = 'vertical' | 'horizontal';

interface Segment {
  orientation: SegmentOrientation;
  min: number;
  max: number;
  coord: number;
}

const EPS = 1e-4;

function toSegments(points: Point[]): Segment[] {
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    if (Math.abs(p1.x - p2.x) < EPS && Math.abs(p1.y - p2.y) < EPS) {
      continue;
    }
    if (Math.abs(p1.x - p2.x) < EPS) {
      const min = Math.min(p1.y, p2.y);
      const max = Math.max(p1.y, p2.y);
      segments.push({ orientation: 'vertical', min, max, coord: p1.x });
    } else if (Math.abs(p1.y - p2.y) < EPS) {
      const min = Math.min(p1.x, p2.x);
      const max = Math.max(p1.x, p2.x);
      segments.push({ orientation: 'horizontal', min, max, coord: p1.y });
    }
  }
  return segments;
}

function segmentsCross(a: Segment, b: Segment, shared: Point): boolean {
  if (a.orientation === b.orientation) {
    return false;
  }

  const vert = a.orientation === 'vertical' ? a : b;
  const horiz = a.orientation === 'horizontal' ? a : b;

  const withinX = horiz.min - EPS <= vert.coord && vert.coord <= horiz.max + EPS;
  const withinY = vert.min - EPS <= horiz.coord && horiz.coord <= vert.max + EPS;
  if (withinX && withinY) {
    return !(Math.abs(vert.coord - shared.x) < EPS && Math.abs(horiz.coord - shared.y) < EPS);
  }
  return false;
}

function edgesCross(aPts: Point[], bPts: Point[]): boolean {
  const shared = aPts[0]!;
  const aSegments = toSegments(aPts);
  const bSegments = toSegments(bPts);
  for (const a of aSegments) {
    for (const b of bSegments) {
      if (segmentsCross(a, b, shared)) {
        return true;
      }
    }
  }
  return false;
}

describe('Raykov orthogonal router crossing regression', () => {
  it('should keep D->E and D->H from crossing', () => {
    const D = mkNode('D', -19.5, 22.5);
    const E = mkNode('E', -19.5, 117.5);
    const H = mkNode('H', -19.5, 212.5);

    const eDE = mkEdge('eDE', 'D', 'E');
    const eDH = mkEdge('eDH', 'D', 'H');

    const data: TestLayout = {
      nodes: [D, E, H],
      edges: [eDE, eDH],
      config: {},
    };

    routeEdgesOrthogonal(asLayout(data));

    expect(edgesCross(eDE.points ?? [], eDH.points ?? [])).toBe(false);
  });
});
