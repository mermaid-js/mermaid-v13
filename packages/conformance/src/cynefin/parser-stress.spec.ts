import { describe, expect, it } from 'vitest';
import { parseCynefin } from '@mermaid-js/diagram-cynefin';

/**
 * R-PARSE-7, pitfall 5: the cynefin parser, value conversion included, is linear in input size.
 * v12's accDescr converter (`/\s+$/gm`) is quadratic on a long blank run inside a line, and so
 * would be a scan per item, block or transition. Same frame as `stress.spec.ts`: n and 8n
 * units, best of five, bar 24x (linear ~8x, quadratic ~64x). Not measured on a steady
 * machine: the bar is a ratio.
 */
const H = 'cynefin-beta\n';
const DOMAINS = ['complex', 'complicated', 'clear', 'chaotic', 'confusion'];
const lines = (n: number, line: (k: number) => string): string =>
  H + Array.from({ length: n }, (_, k) => line(k)).join('\n');

const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `${H}accDescr {a${' '.repeat(n)}b}`],
  ['blank lines inside an accDescr block', (n) => `${H}accDescr {a${' \n'.repeat(n / 2)}b}`],
  ['NBSP runs inside an accDescr block', (n) => `${H}accDescr {a${' '.repeat(n)}\nb}`],
  ['trailing blanks on accDescr block lines', (n) => `${H}accDescr {${'a  \t \n'.repeat(n / 6)}}`],
  ['a trailing blank run in an accDescr block', (n) => `${H}accDescr {a${' '.repeat(n)}}`],
  ['blank runs in a title', (n) => `${H}title a${'  b'.repeat(n / 3)}`],
  ['blank runs in an accTitle', (n) => `${H}accTitle: a${' \t b'.repeat(n / 4)}`],
  ['escapes in an item', (n) => `${H}complex "${'\\n'.repeat(n / 2)}"`],
  ['escapes in a transition label', (n) => `${H}complex --> clear : "${'\\t'.repeat(n / 2)}"`],
  ['many blocks', (n) => lines(n / 10, (k) => DOMAINS[k % 5] ?? 'complex')],
  ['many items in one block', (n) => lines(n / 8, (k) => `complex "i${k}"`)],
  ['one item repeated', (n) => lines(n / 12, () => 'complex "a"')],
  ['many items on one line', (n) => `${H}complex${' "a"'.repeat(n / 4)}`],
  [
    'many transitions',
    (n) => lines(n / 24, (k) => `${DOMAINS[k % 5]} --> ${DOMAINS[(k + 1) % 5]} : "t${k}"`),
  ],
  ['one transition repeated', (n) => lines(n / 18, () => 'complex --> clear')],
  ['many self-loops', (n) => lines(n / 20, () => 'complex --> complex')],
  ['an error on every line', (n) => lines(n / 12, () => 'complex -> clear')],
  ['a stray item on every line', (n) => lines(n / 4, () => '"a"')],
  ['items after a failed line', (n) => `${H}complex ;\n${'"a"\n'.repeat(n / 4)}`],
  ['repeated titles', (n) => lines(n / 8, () => 'title x')],
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

describe('stress: the cynefin parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parseCynefin(small); // warm up
      parseCynefin(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parseCynefin(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parseCynefin(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
