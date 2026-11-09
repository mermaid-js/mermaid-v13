import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutBlock, parseBlock, type BlockModel } from '@mermaid-js/diagram-block';
import {
  blockLayoutViolations,
  blockTestContext,
  blockTestTheme,
} from '@mermaid-js/diagram-block/testing';

/**
 * The block layout is linear in blocks and depth (spec #521 T3, pitfall 5): v12's sizing
 * recursed into each child twice, O(2^depth), so depth 50 never finished. Pie's shape
 * (`../pie/stress.spec.ts`): n and 8n units, linear is ~8x, quadratic ~64x, and the bar is 24x;
 * this thread's CPU time, best of five, small and large alternating. Not measured on a steady
 * machine: the bar is a ratio.
 */
const nested = (depth: number, body: string): string =>
  'block\n' + 'block\n'.repeat(depth) + body + 'end\n'.repeat(depth);

const SHAPES: [string, number, (n: number) => string][] = [
  // Depth 50 (v12: 2^50 sizings) against depth 400. The innermost grid has a spacer and wraps.
  ['nesting', 50, (n) => nested(n, 'columns 2\na b space c d\n')],
  [
    'nesting with columns, spans and a wide sibling at each level',
    50,
    (n) =>
      'block\n' +
      Array.from(
        { length: n },
        (_, k) => `columns 3\nw${k}["${'w'.repeat(1 + (k % 7))}"]:2\nblock\n`
      ).join('') +
      'x y z\n' +
      'end\n'.repeat(n),
  ],
  ['blocks in one row', 500, (n) => 'block\n' + 'a '.repeat(n) + '\n'],
  [
    'blocks on a grid with spans',
    500,
    (n) => 'block\ncolumns 7\n' + 'a b:3 c:2 space\n'.repeat(n / 4),
  ],
  ['composites side by side', 300, (n) => 'block\ncolumns 5\n' + 'block\na b\nend\n'.repeat(n)],
  [
    'edges',
    500,
    (n) =>
      'block\ncolumns 10\n' +
      Array.from({ length: n }, (_, k) => `b${k}`).join(' ') +
      '\n' +
      Array.from({ length: n }, (_, k) => `b${k} --> b${(k * 7) % n}\n`).join(''),
  ],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown): number => {
  const t0 = cpuMs();
  run();
  return cpuMs() - t0;
};

let theme: Theme;
beforeAll(async () => {
  theme = await blockTestTheme();
});

const model = (src: string): BlockModel => {
  const parsed = parseBlock(src, { maxDepth: 10_000 });
  expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return parsed.model;
};

describe('stress: the block layout is linear in blocks and depth', () => {
  it.each(SHAPES)(
    '%s',
    (_name, n, build) => {
      const small = model(build(n));
      const large = model(build(8 * n));
      const lay = (m: BlockModel) => layoutBlock(m, blockTestContext(theme));
      expect(blockLayoutViolations(lay(small))).toEqual([]);
      expect(blockLayoutViolations(lay(large))).toEqual([]);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => lay(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => lay(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('lays out the 100,000-cell spacer (D445) in one pass', () => {
    const m = model('block\ncolumns 3\na space:100001 b\n');
    const layout = layoutBlock(m, blockTestContext(theme));
    expect(layout.blocks).toHaveLength(100_002);
    expect(blockLayoutViolations(layout)).toEqual([]);
  });
});
