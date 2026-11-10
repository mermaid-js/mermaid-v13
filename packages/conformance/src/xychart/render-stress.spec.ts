import { beforeAll, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { streamWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';
import {
  layoutXyChart,
  parseXyChart,
  renderXyChart,
  type XyChartLayout,
  type XyChartModel,
} from '@mermaid-js/diagram-xychart';
import { xyChartTestContext, xyChartTestTheme } from '@mermaid-js/diagram-xychart/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * The XY chart renderer is linear in what it draws (pitfall 5, spec #426 T4): many bars with
 * data labels, a long line with point labels, many legend rows, many labelled categories with
 * line breaks (core's label writer). Laid out once; only `renderXyChart` and the writer's
 * `finish()` are timed. Shape copied from `../pie/stress.spec.ts`: n and 8n units, best of
 * five, ratio `tLarge / max(tSmall, 2)`; linear is ~8x, quadratic ~64x, and the bar is 24x.
 * Not measured on a steady machine: the bar is a ratio.
 */
const nums = (n: number): string =>
  Array.from({ length: n }, (_, i) => (i * 7919) % 1000).join(', ');
const cats = (n: number, sep = ''): string =>
  Array.from({ length: n }, (_, i) => `"c${sep}${i}"`).join(', ');
const SHAPES: [string, (n: number) => string, Record<string, unknown>][] = [
  [
    'bars with data labels',
    (n) => `xychart\n  x-axis [${cats(n)}]\n  bar [${nums(n)}]\n`,
    { showDataLabel: true },
  ],
  [
    'a line with point labels',
    (n) =>
      `xychart\n  x-axis [${cats(n)}]\n  line [${Array.from({ length: n }, (_, i) => `${i} "p${i}"`).join(', ')}]\n`,
    {},
  ],
  [
    'many named plots',
    (n) => `xychart\n${'  bar "a plot" [1, 2, 3]\n'.repeat(n / 8)}`,
    { height: 1e6 },
  ],
  [
    'categories of two lines',
    (n) => `xychart\n  x-axis [${cats(n, '<br>')}]\n  bar [${nums(n)}]\n`,
    {},
  ],
];

let theme: Theme;
beforeAll(async () => {
  theme = await xyChartTestTheme();
});

describe('stress: the XY chart renderer is linear in what it draws', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, section) => {
      const prepare = (n: number): [XyChartModel, XyChartLayout] => {
        const model = parseXyChart(build(n)).model;
        return [model, layoutXyChart(model, xyChartTestContext(theme, section))];
      };
      const ctx = {
        config: { xyChart: section } as unknown as ResolvedConfig,
        theme,
        idPrefix: 'mermaid-0',
        version: '0.0.0',
      };
      const small = prepare(400);
      const large = prepare(3_200);
      const run =
        ([model, layout]: [XyChartModel, XyChartLayout]) =>
        (): void => {
          const w = streamWriter();
          renderXyChart(model, layout, ctx, w);
          w.finish();
        };
      expect(linearRatio(run(small), run(large))).toBeLessThan(24);
    },
    60_000
  );
});
