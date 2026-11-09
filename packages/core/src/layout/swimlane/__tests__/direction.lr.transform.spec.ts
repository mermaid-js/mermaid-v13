// Ported from v12 `swimlanes/__tests__/direction.lr.transform.spec.ts` (c9b12739f), on the
// engine's internal data (`internalData`). The lane title band sides (D536) and anchored nodes
// (D531) are not asserted here; `laneTitleBands.spec.ts` covers the bands.
import { describe, it, expect } from 'vitest';
import type { LayoutData, Node } from '../layoutData.ts';
import type { Graph, NodeId, OrderedLayers, Coordinates } from '../helpers.ts';
import { writeBackToLayoutData } from '../helpers.ts';
import { postProcessSwimlaneLayout as applySwimlaneDirectionTransform } from '../postProcessing.ts';
import { internalData } from './internalData.ts';

function makeTestLayout(): LayoutData {
  // Minimal layout with two nodes in the same lane but different layers (vertical positions)
  // and one node in another lane.
  return internalData(
    [
      { id: 'A', x: 0, y: 0 },
      { id: 'B', x: 0, y: 100 },
      { id: 'C', x: 50, y: 0 },
    ],
    []
  );
}

function mkGraphWithLanesAndNodes(): { g: Graph; ordered: OrderedLayers; coords: Coordinates } {
  // Two top-level lanes with different child spans; children in lane1 span more vertically.
  const layout = internalData(
    [
      { id: 'lane1', isGroup: true, padding: 20 },
      { id: 'lane2', isGroup: true, padding: 20 },
      { id: 'A', parentId: 'lane1', width: 80, height: 40 },
      { id: 'B', parentId: 'lane1', width: 80, height: 40 },
      { id: 'C', parentId: 'lane2', width: 80, height: 40 },
    ],
    []
  );
  const nodeById = new Map<NodeId, Node>(layout.nodes.map((n) => [n.id, n]));

  const g: Graph = { nodes: ['A', 'B', 'C'], edges: [], layout, nodeById };

  const ordered: OrderedLayers = { layers: [['A', 'C'], ['B']] };

  const coords: Coordinates = {
    x: { A: -100, C: 100, B: -100 },
    y: { A: 0, C: 0, B: 120 },
  };

  return { g, ordered, coords };
}

const byId = (nodes: Node[]): Node[] => [...nodes].sort((a, b) => a.id.localeCompare(b.id));

describe('applySwimlaneDirectionTransform', () => {
  it('leaves layout unchanged for TB direction', () => {
    const layout = makeTestLayout();
    const snapshot = layout.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));

    applySwimlaneDirectionTransform(layout, 'TB');

    for (const node of layout.nodes) {
      const before = snapshot.find((s) => s.id === node.id)!;
      expect(node.x).toBe(before.x);
      expect(node.y).toBe(before.y);
    }
  });

  it('maps vertical layering to horizontal progression for LR', () => {
    const layout = makeTestLayout();

    applySwimlaneDirectionTransform(layout, 'LR');

    const A = layout.nodes.find((n) => n.id === 'A')!;
    const B = layout.nodes.find((n) => n.id === 'B')!;
    const C = layout.nodes.find((n) => n.id === 'C')!;

    // A and B started in the same lane (same x) but different layers (y).
    // After transform for LR, they should share the same y (same horizontal lane)
    // but B should be to the right of A (larger x).
    expect(A.y).toBe(B.y);
    expect(B.x!).toBeGreaterThan(A.x!);

    // C started in a different lane (different x) on the same layer as A.
    // After transform, it should share the same x as A (same horizontal progression)
    // but be on a different y (different horizontal lane).
    expect(C.x).toBe(A.x);
    expect(C.y).not.toBe(A.y);
  });

  it('maps vertical layering to reverse vertical progression for BT', () => {
    const layout = makeTestLayout();

    applySwimlaneDirectionTransform(layout, 'BT');

    const A = layout.nodes.find((n) => n.id === 'A')!;
    const B = layout.nodes.find((n) => n.id === 'B')!;
    const C = layout.nodes.find((n) => n.id === 'C')!;

    expect(B.y!).toBeLessThan(A.y!);
    expect(A.x).toBe(B.x);
    expect(C.y).toBe(A.y);
  });

  it('maps vertical layering to reverse horizontal progression for RL', () => {
    const layout = makeTestLayout();

    applySwimlaneDirectionTransform(layout, 'RL');

    const A = layout.nodes.find((n) => n.id === 'A')!;
    const B = layout.nodes.find((n) => n.id === 'B')!;
    const C = layout.nodes.find((n) => n.id === 'C')!;

    expect(A.y).toBe(B.y);
    expect(B.x!).toBeLessThan(A.x!);
    expect(C.x).toBe(A.x);
    expect(C.y).not.toBe(A.y);
  });

  it('positions lanes as horizontal strips for LR (lanes separated by y, shared x span)', () => {
    const { g, ordered, coords } = mkGraphWithLanesAndNodes();

    // First, compute canonical TB coordinates and lane sizing.
    writeBackToLayoutData(g, ordered, coords, { nodeGap: 40, layerGap: 120 });

    const layout = g.layout;
    const lanes = layout.nodes.filter((n) => n.isGroup);

    // Sanity: we need at least two lanes to reason about their relative placement.
    expect(lanes.length).toBeGreaterThanOrEqual(2);

    // Capture initial lane positions in canonical TB orientation.
    const [lane1Before, lane2Before] = byId(lanes).map((n) => ({ x: n.x!, y: n.y! })) as [
      { x: number; y: number },
      { x: number; y: number },
    ];

    // In TB we expect lanes to be arranged as vertical columns:
    // same vertical center (y), different horizontal centers (x).
    expect(lane1Before.y).toBeCloseTo(lane2Before.y, 6);
    expect(lane1Before.x).not.toBeCloseTo(lane2Before.x, 6);

    applySwimlaneDirectionTransform(layout, 'LR');

    const [lane1After, lane2After] = byId(layout.nodes.filter((n) => n.isGroup)) as [Node, Node];

    // After LR transform, lanes should behave like horizontal strips:
    // they should be stacked by y and share (approximately) the same x center.
    expect(lane1After.y).not.toBeCloseTo(lane2After.y!, 6);
    const deltaX = Math.abs(lane1After.x! - lane2After.x!);
    expect(deltaX).toBeLessThan(1e-6);
  });

  it('keeps lane children inside their lane bounds after LR transform', () => {
    const { g, ordered, coords } = mkGraphWithLanesAndNodes();

    // First, write back TB coordinates and lane sizing.
    writeBackToLayoutData(g, ordered, coords, { nodeGap: 40, layerGap: 120 });

    const layout = g.layout;
    const lanes = layout.nodes.filter((n) => n.isGroup);
    const contentNodes = layout.nodes.filter((n) => !n.isGroup);

    // Sanity check: we actually have lanes and content nodes.
    expect(lanes.length).toBeGreaterThan(0);
    expect(contentNodes.length).toBeGreaterThan(0);

    applySwimlaneDirectionTransform(layout, 'LR');

    for (const lane of lanes) {
      const laneTop = (lane.y ?? 0) - (lane.height ?? 0) / 2;
      const laneBottom = (lane.y ?? 0) + (lane.height ?? 0) / 2;
      const children = contentNodes.filter((n) => n.parentId === lane.id);
      for (const child of children) {
        const childTop = (child.y ?? 0) - (child.height ?? 0) / 2;
        const childBottom = (child.y ?? 0) + (child.height ?? 0) / 2;
        expect(childTop).toBeGreaterThanOrEqual(laneTop - 1e-6);
        expect(childBottom).toBeLessThanOrEqual(laneBottom + 1e-6);
      }
    }
  });

  it('keeps nested groups as child clusters inside top-level LR lanes', () => {
    const layout = internalData(
      [
        { id: 'lane1', isGroup: true, padding: 20 },
        { id: 'lane2', isGroup: true, padding: 20 },
        { id: 'nested', isGroup: true, parentId: 'lane1', padding: 12, shape: 'rect' },
        { id: 'A', parentId: 'nested', x: 0, y: 0, width: 80, height: 40 },
        { id: 'B', parentId: 'lane2', x: 120, y: 0, width: 80, height: 40 },
      ],
      []
    );

    applySwimlaneDirectionTransform(layout, 'LR');

    const find = (id: string): Node => layout.nodes.find((n) => n.id === id)!;
    const [lane1, lane2, nested, child] = ['lane1', 'lane2', 'nested', 'A'].map(find) as [
      Node,
      Node,
      Node,
      Node,
    ];

    expect(nested.parentId).toBe('lane1');
    expect(nested.shape).toBe('rect');
    expect(nested.x).toBeCloseTo(child.x!, 6);
    expect(nested.width).toBeLessThan(lane1.width!);
    expect(lane1.x).toBeCloseTo(lane2.x!, 6);

    const nestedLeft = nested.x! - nested.width! / 2;
    const nestedRight = nested.x! + nested.width! / 2;
    expect(child.x! - child.width! / 2).toBeGreaterThanOrEqual(nestedLeft - 1e-6);
    expect(child.x! + child.width! / 2).toBeLessThanOrEqual(nestedRight + 1e-6);
  });
});

describe('a malformed group chain', () => {
  it('lays out a lane whose groups reference each other as parents', () => {
    // Two groups naming each other as parent. Every parent-chain walk in the engine
    // has to stop on its own; one that does not hangs the render rather than failing.
    const layout = internalData(
      [
        { id: 'Lane', isGroup: true, x: 0, y: 0, width: 200, height: 100 },
        { id: 'a', isGroup: true, parentId: 'b', x: 0, y: 0, width: 80, height: 40 },
        { id: 'b', isGroup: true, parentId: 'a', x: 0, y: 0, width: 80, height: 40 },
        { id: 'n', parentId: 'Lane', x: 0, y: 0, width: 60, height: 30 },
      ],
      []
    );

    expect(() => applySwimlaneDirectionTransform(layout, 'LR')).not.toThrow();
  });
});
