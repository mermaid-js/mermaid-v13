// Ported from v12 `swimlanes/__tests__/pipeline.lr.e2e.spec.ts` (c9b12739f). v12 ran toGraphView,
// sugiyamaLayout, the router and post-processing by hand on a `LayoutData` literal; here the same
// chain is a `LayoutGraph` (loose nodes, so the default lane holds them) through the whole engine
// (`runSwimlane`), with v12's plain layering (`ignoreCrossLaneEdges: false`) and spacing. No debug
// logging.
import { describe, expect, it } from 'vitest';
import type { Dir } from '../../types.ts';
import type { LayoutData } from '../layoutData.ts';
import { runSwimlane } from '../swimlane.ts';
import { layoutGraph } from './graphs.ts';

function runSwimlanesPipeline(direction: Dir): LayoutData {
  const graph = layoutGraph({
    direction,
    nodes: ['A', 'B', 'C'],
    edges: [
      ['A', 'B'],
      ['B', 'C'],
    ],
    size: { width: 100, height: 50 },
    spacing: { node: 40, rank: 80 },
  });
  // This bare chain has no swimlanes; use plain layering. The lane-aware default
  // (ignoreCrossLaneEdges = true) would collapse the chain to a single layer.
  return runSwimlane(graph, { ignoreCrossLaneEdges: false });
}

function span(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

describe('Swimlanes LR direction — integrated pipeline', () => {
  it('simple chain is more spread horizontally in LR than in canonical TB', () => {
    const tbNodes = runSwimlanesPipeline('TB').nodes.filter((n) => !n.isGroup);
    const lrNodes = runSwimlanesPipeline('LR').nodes.filter((n) => !n.isGroup);

    const xSpanTB = span(tbNodes.map((n) => n.x ?? 0));
    const ySpanTB = span(tbNodes.map((n) => n.y ?? 0));
    const xSpanLR = span(lrNodes.map((n) => n.x ?? 0));
    const ySpanLR = span(lrNodes.map((n) => n.y ?? 0));

    // In canonical TB orientation the chain should primarily extend vertically.
    expect(xSpanTB).toBeLessThan(ySpanTB);
    // After LR transform, the same chain should extend more horizontally than before.
    expect(xSpanLR).toBeGreaterThan(xSpanTB);
    // And vertical spread in LR should not exceed the TB vertical spread.
    expect(ySpanLR).toBeLessThanOrEqual(ySpanTB);
  });
});
