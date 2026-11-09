import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutSankey, parseSankey, type SankeyModel } from '@mermaid-js/diagram-sankey';
import { sankeyTestContext, sankeyTestTheme } from '@mermaid-js/diagram-sankey/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PERF, pitfall 5: the sankey layout is near linear in the node count on bounded-degree
 * graphs. Same frame as `stress.spec.ts`: n and 8n nodes, best of five, bar 24x (linear ~8x,
 * n log n ~10x, quadratic ~64x). Times are this thread's CPU time; small runs count as at
 * least 2 ms. Not measured on a steady machine: the bar is a ratio.
 *
 * Not a shape here: one node with n links. d3-sankey 0.12.3 re-sorts that node's links once
 * per neighbour moved (`reorderNodeLinks`), which is quadratic in d3 too; v13 keeps d3's steps
 * so its boxes stay d3's.
 */
const SHAPES: [string, (n: number) => string][] = [
  // n nodes in one line: n layers of one node.
  [
    'a long chain',
    (n) =>
      'sankey\n' +
      Array.from({ length: n - 1 }, (_, k) => `c${k},c${k + 1},${1 + (k % 7)}`).join('\n'),
  ],
  // 4 layers of n / 4 nodes, each linked to two in the next layer.
  [
    'a wide DAG',
    (n) => {
      const w = n / 4;
      const rows: string[] = [];
      for (let layer = 0; layer < 3; layer++)
        for (let i = 0; i < w; i++) {
          rows.push(`n${layer}_${i},n${layer + 1}_${i},${1 + (i % 5)}`);
          rows.push(`n${layer}_${i},n${layer + 1}_${(i + 1) % w},${1 + (i % 3)}`);
        }
      return `sankey\n${rows.join('\n')}`;
    },
  ],
];

let theme: Theme;
beforeAll(async () => {
  theme = await sankeyTestTheme();
});

describe('stress: the sankey layout is near linear in the node count', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const parse = (n: number): SankeyModel => parseSankey(build(n)).model;
      const small = parse(400);
      const large = parse(3_200);
      expect(large.nodes.length).toBeGreaterThan(3_000);
      const ctx = sankeyTestContext(theme);
      const lay = (m: SankeyModel) => () => layoutSankey(m, ctx);
      expect(linearRatio(lay(small), lay(large))).toBeLessThan(24);
    },
    60_000
  );
});
