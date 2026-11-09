// Ported from v12 `swimlanes/__tests__/phase2.compact.spec.ts` (c9b12739f), on a graph built from
// a `LayoutGraph` through the adapter.
import { describe, expect, it } from 'vitest';
import { assignLayers_LongestPath } from '../phase2.longestPath.ts';
import { viewOf } from './graphs.ts';

describe('Compact single-input layering', () => {
  it('Does not compact chain within same lane (no lanes -> the default lane)', () => {
    const g = viewOf(
      {
        nodes: ['A', 'B', 'C'],
        edges: [
          ['A', 'B'],
          ['B', 'C'],
        ],
      },
      { groups: false }
    );
    const layering = assignLayers_LongestPath(g, { compactSingleInput: true });
    expect(layering.layers).toEqual([['A'], ['B'], ['C']]);
  });
});
