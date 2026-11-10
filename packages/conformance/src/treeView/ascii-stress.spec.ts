import { describe, expect, it } from 'vitest';
import type { ResolvedConfig } from '@mermaid-js/core/config';
import { parseTreeView, type TreeViewModel } from '@mermaid-js/diagram-treeview';
import { ascii } from '@mermaid-js/diagram-treeview/ascii';

/**
 * #578: treeView's text output is linear in its input: the walk is iterative, each line is a
 * string of its own (no grid as wide as the longest line for every row), and the parser reads
 * back only the names that are not plainly bare, once per name and position. Models are parsed
 * outside the timing; the drawing of n and 8n units is timed through the `ascii` hook, best of
 * five, CPU time, bar 24x (linear ~8x, quadratic ~64x), as `layout-stress.spec.ts`. Not measured
 * on a steady machine: the bar is a ratio.
 */
const H = 'treeView-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['a long name', (n) => `${H}  ${'a'.repeat(n)}`],
  ['a long quoted name', (n) => `${H}  " ${'a  '.repeat(n / 3)}"`],
  ['a long description', (n) => `${H}  a ## ${'d'.repeat(n)}`],
  ['many files', (n) => `${H}src/\n` + '  index.js\n'.repeat(n / 11)],
  ['many files with descriptions', (n) => `${H}src/\n` + '  a.js ## d\n'.repeat(n / 11)],
  ['many highlighted files', (n) => `${H}src/\n` + '  a :::highlight\n'.repeat(n / 16)],
  [
    'many names to quote',
    (n) => {
      let out = `${H}src/\n`;
      for (let i = 0; out.length < n; i++) out += `  " f${i} "\n`;
      return out;
    },
  ],
  ['one name to quote, repeated', (n) => `${H}src/\n` + '  " f "\n'.repeat(n / 8)],
  [
    'deep nesting',
    (n) => {
      let out = H;
      for (let d = 0; out.length < n; d++) out += `${' '.repeat(d + 1)}d/\n`;
      return out;
    },
  ],
  [
    'one deep branch beside many files',
    (n) => {
      let out = H;
      for (let d = 0; d < 60; d++) out += `${' '.repeat(d + 1)}d/\n`;
      return out + 'f\n'.repeat((n - out.length) / 2);
    },
  ],
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

const ctx = { config: {} as ResolvedConfig, warn: () => undefined };
const draw = (model: TreeViewModel): string => ascii(model, undefined, ctx);

describe('stress: treeView text output is linear in its input', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = parseTreeView(build(4_000)).model;
      const large = parseTreeView(build(32_000)).model;
      draw(small); // warm up
      draw(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => draw(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => draw(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
