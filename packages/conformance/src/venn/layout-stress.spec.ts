import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutVenn, parseVenn, type VennModel } from '@mermaid-js/diagram-venn';
import { vennTestContext, vennTestTheme } from '@mermaid-js/diagram-venn/testing';
import { linearRatio } from '../linear-time.ts';

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
      expect(
        linearRatio(
          () => lay(small),
          () => lay(large)
        )
      ).toBeLessThan(24);
    },
    60_000
  );
});
