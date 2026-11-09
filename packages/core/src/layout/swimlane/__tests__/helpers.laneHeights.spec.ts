// Ported from v12 `swimlanes/__tests__/helpers.laneHeights.spec.ts` (c9b12739f), on graphs built
// from a `LayoutGraph` through the adapter. Not ported: the anchored-node case (D531).
import { describe, expect, it } from 'vitest';
import { writeBackToLayoutData } from '../helpers.ts';
import { viewOf } from './graphs.ts';

describe('writeBackToLayoutData lane sizing', () => {
  it('makes all top-level lanes share the same height and vertical center', () => {
    const g = viewOf({
      lanes: { lane1: ['A', 'B'], lane2: ['C'] },
      size: { width: 80, height: 40 },
    });
    // Children in lane1 span more vertically than lane2
    writeBackToLayoutData(
      g,
      { layers: [['A', 'C'], ['B']] },
      { x: { A: -100, C: 100, B: -100 }, y: { A: 0, C: 0, B: 120 } },
      { nodeGap: 40, layerGap: 120 }
    );
    const lane1 = g.nodeById.get('lane1')!;
    const lane2 = g.nodeById.get('lane2')!;
    expect(lane1.height).toBeGreaterThan(0);
    expect(lane2.height).toBeGreaterThan(0);
    expect(lane1.height).toBeCloseTo(lane2.height!, 6);
    expect(lane1.y).toBeCloseTo(lane2.y ?? 0, 6);
  });

  it('keeps a minimum horizontal padding between a top-level lane and its children', () => {
    const g = viewOf({ lanes: { lane: ['child'] }, size: { width: 100, height: 40 }, padding: 8 });
    writeBackToLayoutData(
      g,
      { layers: [['child']] },
      { x: { child: 0 }, y: { child: 0 } },
      { nodeGap: 40, layerGap: 120 }
    );
    expect(g.nodeById.get('lane')!.width).toBeGreaterThanOrEqual(100 + 40);
  });

  it('reserves room above the content for a title taller than the 21px band', () => {
    const tall = viewOf({ lanes: { lane: ['child'] }, size: { width: 100, height: 40 } });
    const plain = viewOf({ lanes: { lane: ['child'] }, size: { width: 100, height: 40 } });
    tall.nodeById.get('lane')!.titleSize = { width: 40, height: 50 };
    for (const g of [tall, plain]) {
      writeBackToLayoutData(
        g,
        { layers: [['child']] },
        { x: { child: 0 }, y: { child: 0 } },
        { nodeGap: 40, layerGap: 120 }
      );
    }
    const band = tall.nodeById.get('lane')!.groupTitleRect!;
    expect(band.bottom - band.top).toBe(50);
    // The content starts below the band.
    expect(band.bottom).toBeLessThanOrEqual(-20);
    expect(tall.nodeById.get('lane')!.height! - plain.nodeById.get('lane')!.height!).toBe(
      2 * (50 - 21)
    );
  });
});
