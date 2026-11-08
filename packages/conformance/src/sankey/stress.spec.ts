import { describe, expect, it } from 'vitest';
import { sankeyTokens } from '@mermaid-js/diagram-sankey';

/**
 * R-PARSE-7, pitfall 5: the sankey lexer is linear in input size, in every state and over
 * each of v12's rewrites (trimming, collapsed line breaks, removed spans, entities, stalls).
 * Shape copied from `../pie/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic ~64x,
 * and the bar is 24x. Times are this thread's CPU time, best of five, and small and large
 * lexes alternate.
 */
const S = 'sankey\n';
const SHAPES: [string, (n: number) => string][] = [
  ['a long field', (n) => S + 'a'.repeat(n) + ',b,1'],
  ['a long field of blanks', (n) => S + 'a' + ' '.repeat(n) + 'b,c,1'],
  ['a long value', (n) => S + 'a,b,' + '1 '.repeat(n / 2)],
  ['many rows', (n) => S + 'a,b,1\n'.repeat(n / 6)],
  ['blank lines', (n) => S + 'a,b,1' + '\n'.repeat(n) + 'c,d,2'],
  ['blank CRLF lines', (n) => S + 'a,b,1' + '\r\n'.repeat(n / 2) + 'c,d,2'],
  ['lines of blanks', (n) => S + 'a,b,1' + '\n   '.repeat(n / 4)],
  ['leading blanks and line breaks', (n) => ' \n'.repeat(n / 2) + S + 'a,b,1'],
  ['trailing blanks and line breaks', (n) => S + 'a,b,1' + ' \n'.repeat(n / 2)],
  ['a long quoted field', (n) => S + '"' + 'a,'.repeat(n / 2) + '",b,1'],
  ['a quoted field of line breaks', (n) => S + '"a' + '\n'.repeat(n) + 'b",c,1'],
  ['doubled quotes', (n) => S + '"' + '""'.repeat(n / 2) + '",b,1'],
  ['an unterminated quote', (n) => S + '"' + 'a,b,1\n'.repeat(n / 6)],
  ['an unterminated quote of doubled quotes', (n) => S + '"' + '""'.repeat(n / 2)],
  ['many quoted fields', (n) => S + '"a","b",1\n'.repeat(n / 10)],
  ['stray quotes', (n) => S + 'a"'.repeat(n / 2)],
  ['a run of characters no rule reads', (n) => S + 'a' + 'é'.repeat(n) + ',b,1'],
  ['many characters no rule reads', (n) => S + 'a\t'.repeat(n / 2)],
  ['tabs in quotes', (n) => S + '"' + 'a\t'.repeat(n / 2) + '",b,1'],
  ['entities', (n) => S + '#a;'.repeat(n / 3) + ',b,1'],
  ['hashes', (n) => S + '#a'.repeat(n / 2) + ',b,1'],
  ['comment lines between rows', (n) => S + 'a,b,1\n%% c\n'.repeat(n / 11)],
  ['blanks then comment lines', (n) => S + 'a,b,1' + ' \n'.repeat(n / 4) + '%% c\n'],
  ['a quoted field split by comment lines', (n) => S + '"a\n%% c\n'.repeat(n / 8) + '",b,1'],
  ['directives through fields', (n) => S + 'a%%{init: {}}%%b,c,1\n'.repeat(n / 21)],
  ['CRLF rows split by comment lines', (n) => S + 'a,b,1\r\n%% c\r\n'.repeat(n / 13)],
  ['bare percent lines', (n) => S + 'a,b,1\n%%\n'.repeat(n / 9)],
  ['tag attributes', (n) => S + '<b c="x">,d,1\n'.repeat(n / 14)],
  // A dropped `;` and many removed spans: each token's range is read across the cut text.
  [
    'a style line, then CRLF rows split by comment lines',
    (n) => S + 'style a:#f;,b,1\r\n' + 'a,b,1\r\n%% c\r\n'.repeat(n / 13),
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

describe('stress: the sankey lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      sankeyTokens(small); // warm up
      sankeyTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => sankeyTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => sankeyTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
