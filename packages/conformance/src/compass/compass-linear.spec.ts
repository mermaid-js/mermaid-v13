/**
 * R-PERF-2, R-LAYOUT-9: `compass` places labels in near-linear time. A ratio test on CPU time
 * (best of 5), not an absolute time, so a busy machine slows both sizes alike: 8 times the edges
 * should cost about 8 times as much; scanning every node or label per candidate spot would cost
 * about 64 times.
 */
import type { LayoutGraph } from '@mermaid-js/core/layout';
import { compass } from '@mermaid-js/core/layout/compass';
import { describe, expect, it } from 'vitest';
import { linearRatio } from '../linear-time.ts';

/**
 * Rows of ten nodes, each row a chain left to right and each row's first node hung below the
 * previous one, every edge with a middle label and end labels and markers.
 */
function labelled(n: number): LayoutGraph {
  return {
    direction: 'LR',
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, width: 60, height: 30 })),
    edges: Array.from({ length: n - 1 }, (_, k) => {
      const t = k + 1;
      const down = t % 10 === 0;
      return {
        id: `e${k}`,
        source: `n${down ? t - 10 : k}`,
        target: `n${t}`,
        minLen: 1,
        ...(down ? { sides: { source: 'bottom', target: 'top' } as const } : {}),
        label: { width: 40, height: 14 },
        startLabel: { width: 12, height: 14 },
        endLabel: { width: 12, height: 14 },
        endMarker: { length: 8, width: 8 },
      };
    }),
    groups: [],
    spacing: { node: 10, rank: 40, edge: 10 },
  };
}

describe('compass is near linear (R-PERF-2)', () => {
  it('places labels on 8 times the edges in well under 64 times the time', () => {
    const small = labelled(1_000);
    const large = labelled(8_000);
    expect(
      linearRatio(
        () => compass(small),
        () => compass(large)
      )
    ).toBeLessThan(24);
  }, 120_000);
});
