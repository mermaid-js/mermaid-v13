// Ported from v12 `swimlanes/orthogonalRouter/__tests__/raykov.detour.spec.ts` (c9b12739f). Changed: the
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
  const width = opts?.width ?? 42;
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

describe('Raykov orthogonal router - detour issue', () => {
  it('should route J→E directly without U-shaped detour', () => {
    // EXACT coordinates from user's rendered diagram:
    // Node E: translate(-139.77734375, 117.5), width=41.34375, height=45
    // Node J: translate(0.78125, 117.5), width=39, height=45
    // Node F: translate(140.55859375, 117.5), width=40.5546875, height=45
    // All three at y=117.5!

    // Lanes (groups) - approximate
    const Constr = mkNode('Constr', -139.77734375, 70, { width: 100, height: 190, isGroup: true });
    const Legal = mkNode('Legal', 0.78125, 70, { width: 100, height: 190, isGroup: true });
    const Fun = mkNode('Fun', 140.55859375, 70, { width: 100, height: 190, isGroup: true });

    // Nodes with EXACT user coordinates
    const H = mkNode('H', -139.77734375, 22.5, { width: 41.34375, height: 45, parentId: 'Constr' });
    const I = mkNode('I', 0.78125, 22.5, { width: 39, height: 45, parentId: 'Legal' });
    const J = mkNode('J', 0.78125, 117.5, { width: 39, height: 45, parentId: 'Legal' });
    const E = mkNode('E', -139.77734375, 117.5, {
      width: 41.34375,
      height: 45,
      parentId: 'Constr',
    });
    const F = mkNode('F', 140.55859375, 117.5, { width: 40.5546875, height: 45, parentId: 'Fun' });

    // Edges - in the order they appear in the flowchart
    const eHI = mkEdge('eHI', 'H', 'I');
    const eIJ = mkEdge('eIJ', 'I', 'J');
    const eJE = mkEdge('eJE', 'J', 'E');
    const eEF = mkEdge('eEF', 'E', 'F');

    const data: TestLayout = {
      nodes: [Constr, Legal, Fun, H, I, J, E, F],
      edges: [eHI, eIJ, eJE, eEF],
      config: {},
    };

    routeEdgesOrthogonal(asLayout(data));

    // Check J→E
    expect(eJE.points).toBeDefined();
    const pointsJE = eJE.points!;

    const yValuesJE = pointsJE.map((p) => p.y);
    const minYJE = Math.min(...yValuesJE);
    const maxYJE = Math.max(...yValuesJE);
    const yRangeJE = maxYJE - minYJE;

    // J and E are on the same row (y=117.5), path should be mostly horizontal
    expect(yRangeJE).toBeLessThan(50);

    // Check E→F
    expect(eEF.points).toBeDefined();
    const pointsEF = eEF.points!;

    const yValuesEF = pointsEF.map((p) => p.y);
    const minYEF = Math.min(...yValuesEF);
    const maxYEF = Math.max(...yValuesEF);
    const yRangeEF = maxYEF - minYEF;

    // E and F are on the same row but J is between them - some vertical deviation expected
    // But should route around J efficiently (up or down, not huge detour)
    expect(yRangeEF).toBeLessThan(100);
  });
});
