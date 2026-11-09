import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutXyChart, parseXyChart, type XyChartModel } from '@mermaid-js/diagram-xychart';
import { xyChartTestContext, xyChartTestTheme } from '@mermaid-js/diagram-xychart/testing';

/**
 * The XY chart layout is linear in the data (pitfall 5): many categories with data labels, long
 * lines with point labels and gaps, many named plots (the legend), duplicate categories, a wide
 * canvas (the data-label font search). Shape copied from `../pie/stress.spec.ts`: n and 8n
 * units, best of five, ratio `tLarge / max(tSmall, 2)`; linear is ~8x, quadratic ~64x, and the
 * bar is 24x. Not measured on a steady machine: the bar is a ratio.
 */
const nums = (n: number): string =>
  Array.from({ length: n }, (_, i) => (i * 7919) % 1000).join(', ');
const cats = (n: number): string => Array.from({ length: n }, (_, i) => `c${i}`).join(', ');
const SHAPES: [string, (n: number) => string, Record<string, unknown>][] = [
  [
    'bars with data labels',
    (n) => `xychart\n  x-axis [${cats(n)}]\n  bar [${nums(n)}]\n`,
    { showDataLabel: true },
  ],
  [
    'horizontal bars with labels',
    (n) => `xychart horizontal\n  x-axis [${cats(n)}]\n  bar [${nums(n)}]\n`,
    { showDataLabel: true },
  ],
  [
    'a line with point labels and gaps',
    (n) =>
      `xychart\n  x-axis [${cats(n)}]\n  line [${Array.from({ length: n / 2 }, (_, i) => `${i} "p${i}"`).join(', ')}]\n`,
    {},
  ],
  [
    'many named plots',
    (n) => `xychart\n${'  line "a plot" [1, 2, 3]\n'.repeat(n / 8)}`,
    { height: 1e6 },
  ],
  [
    'duplicate categories',
    (n) => `xychart\n  x-axis [${'a, '.repeat(n - 1)}a]\n  bar [${nums(n)}]\n`,
    {},
  ],
  ['a wide canvas', (n) => `xychart\n  bar [${nums(n)}]\n`, { showDataLabel: true, width: 1e9 }],
];

const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};

let theme: Theme;
beforeAll(async () => {
  theme = await xyChartTestTheme();
});

describe('stress: the XY chart layout is linear in the data', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, section) => {
      const small = parseXyChart(build(400)).model;
      const large = parseXyChart(build(3_200)).model;
      const run = (m: XyChartModel): number => {
        const t0 = cpuMs();
        layoutXyChart(m, xyChartTestContext(theme, section));
        return cpuMs() - t0;
      };
      run(small);
      run(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(tSmall, run(small));
        tLarge = Math.min(tLarge, run(large));
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
