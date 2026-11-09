import { beforeAll, describe, expect, it } from 'vitest';
import type { Theme } from '@mermaid-js/core/theme';
import { layoutIshikawa, parseIshikawa, type IshikawaModel } from '@mermaid-js/diagram-ishikawa';
import {
  ishikawaLayoutViolations,
  ishikawaTestContext,
  ishikawaTestTheme,
} from '@mermaid-js/diagram-ishikawa/testing';

/**
 * The ishikawa layout is linear in the causes it lays out (spec #519 T3, pitfalls 5 and 19), and
 * a chain as deep as the parser takes does not overflow the stack. Pie's shape
 * (`../pie/stress.spec.ts`): n and 8n units, linear is ~8x, quadratic ~64x, and the bar is 24x;
 * this thread's CPU time, best of five, small and large alternating. Not measured on a steady
 * machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['leaf causes', (n) => 'ishikawa-beta\n  P\n' + '  cause\n'.repeat(n)],
  ['sub-causes of one cause', (n) => 'ishikawa-beta\n  P\n  C\n' + '    sub\n'.repeat(n)],
  [
    'causes with a sub-cause each',
    (n) => 'ishikawa-beta\n  P\n' + '  cause\n    sub\n'.repeat(Math.floor(n / 2)),
  ],
  [
    'a chain',
    (n) =>
      'ishikawa-beta\n  P\n' +
      Array.from({ length: n }, (_, i) => `${' '.repeat(i + 2)}c\n`).join(''),
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
  theme = await ishikawaTestTheme();
});

const model = (src: string): IshikawaModel => parseIshikawa(src).model;
const lay = (m: IshikawaModel) => layoutIshikawa(m, ishikawaTestContext(theme));

describe('stress: the ishikawa layout is linear in causes', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = model(build(500));
      const large = model(build(4_000));
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

  it('lays out a 5,000-deep chain without overflowing the stack', () => {
    const deep = model(SHAPES[3]![1](5_000));
    const layout = lay(deep);
    expect(layout.pairs[0]!.causes[0]!.subCauses).toHaveLength(4_999);
    expect(ishikawaLayoutViolations(deep, layout)).toEqual([]);
  }, 60_000);
});
