import { describe, expect, it } from 'vitest';
import { parseJourney } from '@mermaid-js/diagram-journey';

/**
 * R-PARSE-7, pitfall 5: the journey parser, value conversion and actor ranges included, is
 * linear in input size. Same frame as `stress.spec.ts`: n and 8n units, best of five, bar 24x
 * (linear ~8x, quadratic ~64x). Not measured on a steady machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['many actors in one task', (n) => `journey\nT: 5: ${'a,'.repeat(n / 2)}b`],
  ['many actors, then more pieces', (n) => `journey\nT: 5: ${'a, '.repeat(n / 3)}b: c: d`],
  ['blank runs between actors', (n) => `journey\nT: 5: a${' '.repeat(n)}, b`],
  [
    'many tasks',
    (n) => 'journey\n' + Array.from({ length: n / 12 }, (_, k) => `T${k}: 3: A${k % 7}`).join('\n'),
  ],
  ['many sections', (n) => 'journey\n' + 'section S\n'.repeat(n / 10)],
  ['blank lines inside an accDescr block', (n) => `journey\naccDescr {a${'\n '.repeat(n / 2)}b}`],
  ['blank runs in a title', (n) => `journey\ntitle a${'  b'.repeat(n / 3)}`],
  ['an error on every line', (n) => 'journey\n' + 'Make tea\n'.repeat(n / 9)],
  ['comments after task names', (n) => 'journey\n' + 'Make tea # c\n'.repeat(n / 13)],
  ['an unclosed description', (n) => `journey\naccDescr {${'a\n'.repeat(n / 2)}`],
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

describe('stress: the journey parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseJourney(small); // warm up
      parseJourney(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseJourney(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseJourney(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
