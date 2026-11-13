import { beforeAll, describe, expect, it } from 'vitest';
import { createTheme, loadTheme, type Theme } from '@mermaid-js/core/theme';
import {
  c4TestConfig,
  c4TestContext,
  layoutC4BetaFull,
  parseC4Beta,
} from '@mermaid-js/diagram-c4/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-SEC-5, pitfall 5: the c4-beta layout, measuring and the engine included, is linear in the
 * size of the diagram. Each shape is laid out at n and 8n units; linear is about 8x, quadratic
 * about 64x, and the bar is 24x. Times are CPU times (`linearRatio`), so the bar is a ratio,
 * never a time. The source is parsed once: only the layout is timed.
 */
const H = 'c4-beta container\n';
const lines = (n: number, line: (k: number) => string): string =>
  Array.from({ length: n }, (_, k) => line(k)).join('\n');
const NO_LIMITS = { maxNodes: Infinity, maxEdges: Infinity, maxDepth: Infinity };

/** A shape: its source for n units, and n at the small size. */
const SHAPES: [string, (n: number) => string, number][] = [
  [
    'many elements, each related to the next',
    (n) =>
      `${H}${lines(n, (k) => `container e${k} "E ${k}" "Does ${k}." "Go"`)}\n` +
      lines(n - 1, (k) => `e${k} --> e${k + 1} : "next" "HTTP"`),
    200,
  ],
  [
    'many relations among few elements',
    (n) =>
      `${H}${lines(n / 4, (k) => `container e${k} "E ${k}"`)}\n` +
      lines(n, (k) => `e${k % (n / 4)} --> e${(k * 7 + 3) % (n / 4)} : "r ${k}"`),
    80,
  ],
  [
    'boundaries side by side',
    (n) =>
      H +
      lines(
        n,
        (k) =>
          `softwareSystem s${k} "S ${k}" {\n  container c${k} "C ${k}"\n}\ns${k} --> c${(k + 1) % n} : "uses"`
      ),
    20,
  ],
  [
    'boundaries nested deep',
    (n) =>
      H +
      lines(n, (k) => `deploymentNode d${k} "D ${k}" {`) +
      `\ncontainer leaf "Leaf"\n${'}\n'.repeat(n)}person p "P"\np --> leaf : "enters"`,
    12,
  ],
];

let theme: Theme;
beforeAll(async () => {
  theme = createTheme(await loadTheme('default'));
});

describe('stress: the c4-beta layout is linear in the size of the diagram', () => {
  it.each(SHAPES)(
    '%s',
    (name, build, units) => {
      const ctx = c4TestContext(c4TestConfig(), theme);
      const parsed = (n: number) => {
        const { model, diagnostics } = parseC4Beta(build(n), NO_LIMITS);
        expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        return model;
      };
      const small = parsed(units);
      const large = parsed(8 * units);
      expect(
        linearRatio(
          () => layoutC4BetaFull(small, ctx),
          () => layoutC4BetaFull(large, ctx),
          process.env.STRESS_LOG ? name : undefined
        )
      ).toBeLessThan(24);
    },
    120_000
  );
});
