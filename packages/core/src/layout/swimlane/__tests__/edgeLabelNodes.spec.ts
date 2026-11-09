// Ported from v12 `swimlanes/__tests__/edgeLabelNodes.spec.ts` (c9b12739f), on data the adapter
// builds from a `LayoutGraph`. Changed: a label is a measured size, which the label node takes
// as its own and the edge keeps (the model writes the label position back onto the edge).
import { describe, expect, it } from 'vitest';
import { toLayoutData } from '../adapter.ts';
import { createEdgeLabelNodes } from '../edgeLabelNodes.ts';
import { type GraphSpec, layoutGraph } from './graphs.ts';

const LABEL = { width: 30, height: 16 };
const run = (spec: GraphSpec) => createEdgeLabelNodes(toLayoutData(layoutGraph(spec)));

describe('createEdgeLabelNodes', () => {
  it('should not modify edges without labels', () => {
    const result = run({ nodes: ['A', 'B'], edges: [['A', 'B']] });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]!.labelNodeId).toBeUndefined();
  });

  it('should create a label node and layout-only virtual edges for a labelled edge', () => {
    const result = run({ lanes: { lane1: ['A', 'B'] }, edges: [['A', 'B', LABEL]] });

    // Should have 4 nodes: A, B, lane1, and the label node
    expect(result.nodes).toHaveLength(4);
    const labelNode = result.nodes.find((n) => n.isEdgeLabel);
    expect(labelNode).toMatchObject({
      id: 'edge-label-A-B-e0',
      width: 30,
      height: 16,
      edgeStart: 'A',
      edgeEnd: 'B',
      shape: 'labelRect',
      isDummy: true,
      parentId: 'lane1', // Same lane as source
    });

    expect(result.edges).toHaveLength(3);
    const original = result.edges.find((e) => e.id === 'e0')!;
    expect(original.labelNodeId).toBe('edge-label-A-B-e0');
    expect(original.isLayoutOnly).toBeUndefined();
    expect(original.start).toBe('A');
    expect(original.end).toBe('B');

    expect(result.edges.find((e) => e.id === 'e0-to-label')).toMatchObject({
      start: 'A',
      end: 'edge-label-A-B-e0',
      isLayoutOnly: true,
    });
    expect(result.edges.find((e) => e.id === 'e0-from-label')).toMatchObject({
      start: 'edge-label-A-B-e0',
      end: 'B',
      isLayoutOnly: true,
    });
  });

  it('puts the label of a cross-lane edge in the target lane', () => {
    const result = run({ lanes: { s1: ['A'], s2: ['B'] }, edges: [['A', 'B', LABEL]] });
    expect(result.nodes.find((n) => n.isEdgeLabel)?.parentId).toBe('s2');
  });

  it('should create label nodes for multiple labelled edges', () => {
    const result = run({
      nodes: ['A', 'B', 'C'],
      edges: [
        ['A', 'B', LABEL],
        ['B', 'C', LABEL],
      ],
    });
    expect(result.nodes).toHaveLength(5);
    expect(result.nodes.filter((n) => n.isEdgeLabel)).toHaveLength(2);
    // 2 originals + 2 × 2 layout-only virtual edges
    expect(result.edges).toHaveLength(6);
    expect(result.edges.filter((e) => e.isLayoutOnly === true)).toHaveLength(4);
  });

  it('should skip edges that already carry a labelNodeId stamp', () => {
    const data = toLayoutData(layoutGraph({ nodes: ['A', 'B'], edges: [['A', 'B', LABEL]] }));
    data.edges[0]!.labelNodeId = 'pre-existing-label';
    const result = createEdgeLabelNodes(data);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
  });
});
