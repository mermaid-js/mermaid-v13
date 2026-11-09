import { describe, expect, it } from 'vitest';
import { parseTreemap } from '@mermaid-js/diagram-treemap';

/**
 * R-PARSE-7, pitfall 5: the treemap parser, value conversion, tree building and warnings
 * included, is linear in input size. v12's accDescr converter (`/\s+$/gm`) is quadratic on a
 * long blank run inside a line; here the deep paths of AST ids, the stack of sections, the
 * one-warning-per-line lists and recovery must not be. Same frame as `stress.spec.ts`: n and 8n
 * units, best of five, bar 24x (linear ~8x, quadratic ~64x). Not measured on a steady machine:
 * the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `treemap\naccDescr {a${' '.repeat(n)}b}`],
  ['blank lines inside an accDescr block', (n) => `treemap\naccDescr {a${' \n'.repeat(n / 2)}b}`],
  ['blank runs in a title', (n) => `treemap\ntitle a${'  b'.repeat(n / 3)}`],
  ['many leaves', (n) => 'treemap\n"r"\n' + '  "a": 1\n'.repeat(n / 9)],
  ['many sections', (n) => 'treemap\n' + '"s"\n'.repeat(n / 4)],
  [
    'deep nesting',
    (n) => {
      let out = 'treemap\n';
      for (let d = 0; out.length < n; d++) out += `${' '.repeat(d)}"s"\n`;
      return out;
    },
  ],
  ['rows on one line', (n) => 'treemap\n' + '"a": 1 '.repeat(n / 7) + '"z": 1'],
  ['rows indented by trailing blanks', (n) => 'treemap\n' + '"s" \n'.repeat(n / 5)],
  ['odd values', (n) => 'treemap\n' + '"a": 1_0\n'.repeat(n / 9)],
  [
    'a class used on every row',
    (n) => 'treemap\nclassDef hot fill:red\n' + '"a": 1:::hot\n'.repeat(n / 13),
  ],
  ['repeated classDefs', (n) => 'treemap\n' + 'classDef hot fill:red,stroke:blue\n'.repeat(n / 34)],
  ['an error on every line', (n) => 'treemap\n' + 'a: 1\n'.repeat(n / 5)],
  ['a stray blank on every line', (n) => 'treemap\n"r"\n' + '  "a": 1 \n'.repeat(n / 10)],
  ['a long name', (n) => `treemap\n"${'a'.repeat(n)}": 1`],
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

describe('stress: the treemap parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseTreemap(small); // warm up
      parseTreemap(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseTreemap(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseTreemap(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
