import { describe, expect, it } from 'vitest';
import { parsePacket } from '@mermaid-js/diagram-packet';

/**
 * R-PARSE-7, pitfall 5: the packet parser, value conversion, checks and row splitting included,
 * is linear in input size. v12's accDescr converter (`/\s+$/gm`) is quadratic on a long blank
 * run inside a line. Same frame as `stress.spec.ts`: n and 8n units, bar 24x (linear ~8x,
 * quadratic ~64x), this thread's CPU time, best of five, each measurement repeated until the
 * small one takes at least {@link MIN_MS}. Not measured on a steady machine: the bar is a ratio.
 */
const P = 'packet\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks inside an accDescr block line', (n) => `${P}accDescr {a${' '.repeat(n)}b}`],
  ['blank lines inside an accDescr block', (n) => `${P}accDescr {a${' \n'.repeat(n / 2)}b}`],
  ['NBSP runs inside an accDescr block', (n) => `${P}accDescr {a${' '.repeat(n)}\nb}`],
  ['blank runs in a title', (n) => `${P}title a${'  b'.repeat(n / 3)}`],
  ['escapes in a label', (n) => `${P}0: "${'\\n'.repeat(n / 2)}"`],
  [
    'range fields',
    (n) => P + Array.from({ length: n / 12 }, (_, k) => `${k * 4}-${k * 4 + 3}: "f"`).join('\n'),
  ],
  ['width fields', (n) => P + '+8: "a"\n'.repeat(n / 8)],
  ['fields split across rows', (n) => P + '+40: "a"\n'.repeat(n / 9)],
  ['one-bit fields in one long row', (n) => P + '+1: "a"\n'.repeat(n / 7)],
  ['an error on every line', (n) => P + '0-7 "a"\n'.repeat(n / 8)],
  [
    'a gap on every line',
    (n) => P + Array.from({ length: n / 8 }, (_, k) => `${k * 2}: "a"`).join('\n'),
  ],
  ['one range repeated', (n) => P + '0-7: "a"\n'.repeat(n / 9)],
  ['zero widths', (n) => P + '+0: "a"\n'.repeat(n / 8)],
  ['repeated titles', (n) => P + 'title x\n'.repeat(n / 8)],
];

const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};
/** The shortest small measurement. */
const MIN_MS = 8;
const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (cost(run, reps) < MIN_MS) reps *= 2;
  return reps;
};

describe('stress: the packet parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      parsePacket(large); // warm up
      const reps = repeatsFor(() => parsePacket(small));
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => parsePacket(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => parsePacket(large), reps)
        );
      }
      expect(tLarge / tSmall).toBeLessThan(24);
    },
    60_000
  );
});
