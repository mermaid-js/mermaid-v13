import { describe, expect, it } from 'vitest';
import { journeyTokens } from '@mermaid-js/diagram-journey';

/**
 * R-PARSE-7, pitfall 5: the journey lexer is linear in input size, in every state and on every
 * rule with a blank or line-break run. Shape copied from `../sequence/stress.spec.ts`: n and 8n
 * units; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time,
 * and small and large lexes alternate.
 */
const J = 'journey\n';
const SHAPES: [string, (n: number) => string][] = [
  ['task data then blanks', (n) => J + 'T: 1' + ' '.repeat(n)],
  ['blank lines after blanks', (n) => J + ' \n'.repeat(n / 2) + 'T: 1'],
  ['a bare title before line breaks', (n) => J + 'title' + '\n'.repeat(n)],
  ['a bare section before blanks', (n) => J + 'section' + ' '.repeat(n)],
  ['acc title blanks', (n) => J + 'accTitle:' + ' '.repeat(n) + 'x'],
  [
    'accTitle then blanks, no colon',
    (n) => J + ('accTitle' + ' '.repeat(50) + 'x\n').repeat(n / 60),
  ],
  ['an open accDescr body', (n) => J + 'accDescr {' + ' '.repeat(n)],
  [
    'an open accDescr body split by comment lines',
    (n) => J + 'accDescr {' + 'x\n%% c\n'.repeat(n / 7),
  ],
  ['a long blank-separated task name', (n) => J + 'a '.repeat(n / 2) + ': 1'],
  ['bare %% lines', (n) => J + 'T: 1\n%%\n'.repeat(n / 8)],
  ['percent comments', (n) => J + 'x%%'.repeat(n / 3)],
  ['semicolons', (n) => J + ';'.repeat(n)],
  ['entities', (n) => J + 'T: ' + '#a;'.repeat(n / 3)],
  ['CRLF lines', (n) => J + 'T: 1: A\r\n'.repeat(n / 9)],
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

describe('stress: the journey lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      journeyTokens(small); // warm up
      journeyTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => journeyTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => journeyTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
