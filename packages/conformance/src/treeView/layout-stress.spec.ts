import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutTreeView, parseTreeView, type TreeViewModel } from '@mermaid-js/diagram-treeview';
import { treeViewTestContext, treeViewTestTheme } from '@mermaid-js/diagram-treeview/testing';

/**
 * #573: the treeView layout is linear in its input: each label and description is measured
 * once, the walk is iterative, and the description column and the highlight boxes are one pass
 * each. Long names must not be quadratic (pitfall 5). Models are parsed outside the timing; the
 * layout of n and 8n units is timed, best of five, CPU time, bar 24x (linear ~8x, quadratic
 * ~64x), as `parser-stress.spec.ts`. Not measured on a steady machine: the bar is a ratio.
 */
const H = 'treeView-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['a long name', (n) => `${H}  ${'a'.repeat(n)}`],
  ['a long name with blank runs', (n) => `${H}  "${'a  '.repeat(n / 3)}"`],
  ['a long description', (n) => `${H}  a ## ${'d'.repeat(n)}`],
  ['many files', (n) => `${H}src/\n` + '  index.js\n'.repeat(n / 11)],
  ['many files with descriptions', (n) => `${H}src/\n` + '  a.js ## d\n'.repeat(n / 11)],
  ['many highlighted files', (n) => `${H}src/\n` + '  a :::highlight\n'.repeat(n / 16)],
  ['many files with icons', (n) => `${H}src/\n` + '  a.ts icon(x)\n'.repeat(n / 14)],
  [
    'deep nesting',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${' '.repeat(d + 1)}d/\n`;
      return out;
    },
  ],
  ['many parents', (n) => H + 'd/\n  a\n'.repeat(n / 7)],
];

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
  theme = await treeViewTestTheme();
});

describe('stress: the treeView layout is linear in its input', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const ctx = treeViewTestContext(theme, { showIcons: true });
      const small: TreeViewModel = parseTreeView(build(4_000)).model;
      const large: TreeViewModel = parseTreeView(build(32_000)).model;
      layoutTreeView(small, ctx); // warm up
      layoutTreeView(large, ctx);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => layoutTreeView(small, ctx))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => layoutTreeView(large, ctx))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
