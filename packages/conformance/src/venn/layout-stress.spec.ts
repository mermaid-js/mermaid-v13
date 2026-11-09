import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutVenn, parseVenn, type VennModel } from '@mermaid-js/diagram-venn';
import { vennTestContext, vennTestTheme } from '@mermaid-js/diagram-venn/testing';

/**
 * The venn layout is linear in what it lays out besides the sets (spec #429 T3, pitfall 5):
 * text nodes, styles and label words. The solver's cost grows with the number of sets, as
 * venn.js's does, and a diagram has a handful. Pie's shape (`../pie/stress.spec.ts`): n and 8n
 * units, linear is ~8x, quadratic ~64x, and the bar is 24x; this thread's CPU time, best of
 * five, small and large alternating. Not measured on a steady machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['text nodes in one set', (n) => 'venn-beta\nset A\n' + '  text t\n'.repeat(n)],
  [
    'text nodes over three areas',
    (n) =>
      'venn-beta\n' +
      ['set A', 'set B', 'union A,B']
        .map((s, k) => `${s}\n` + `  text t${k}\n`.repeat(Math.floor(n / 3)))
        .join(''),
  ],
  ['styles on one set', (n) => 'venn-beta\nset A\nset B\n' + 'style A fill: red\n'.repeat(n)],
  ['a set label of many words', (n) => `venn-beta\nset A["${'word '.repeat(n)}"]\nset B`],
  ['a text node of many words', (n) => `venn-beta\nset A\n  text t["${'word '.repeat(n)}"]`],
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
  theme = await vennTestTheme();
});

const model = (src: string): VennModel => parseVenn(src).model;

describe('stress: the venn layout is linear in text nodes, styles and words', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = model(build(500));
      const large = model(build(4_000));
      const lay = (m: VennModel) => layoutVenn(m, vennTestContext(theme));
      lay(small); // warm up
      lay(large);
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
});
