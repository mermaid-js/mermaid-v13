import { describe, expect, it } from 'vitest';
import { ishikawaTokens } from '@mermaid-js/diagram-ishikawa';

/**
 * R-PARSE-7, pitfall 5: the ishikawa lexer is linear in input size, on blank runs and long
 * lines and in every rule that scans free text. Shape from `../pie/stress.spec.ts`: n and 8n
 * units, up to 80k lines; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this
 * thread's CPU time, best of five, and small and large lexes alternate.
 */
const H = 'ishikawa-beta\n  P\n';
const SHAPES: [string, (n: number) => string][] = [
  ['cause lines', (n) => H + '  A\n'.repeat(n)],
  ['nested lines', (n) => H + '  A\n    a1\n      a2\n'.repeat(n / 3)],
  ['blank lines', (n) => H + '\n'.repeat(n) + '  A'],
  ['blank lines with blanks', (n) => H + '   \n'.repeat(n / 4) + '  A'],
  ['blank lines with tabs and separators', (n) => H + ' \t\u2028\n'.repeat(n / 4) + '  A'],
  ['a long indent', (n) => H + ' '.repeat(n) + 'A'],
  ['a long indent at the end', (n) => H + ' '.repeat(n)],
  ['a line break then a long indent', (n) => H + '\n' + ' '.repeat(n) + 'A'],
  ['a long blank run then a line break', (n) => H + ' '.repeat(n) + '\n  A'],
  ['a long indent of line separators', (n) => H + '\u2028'.repeat(n) + 'A'],
  ['a long line', (n) => H + '  ' + 'x '.repeat(n / 2)],
  ['a long effect on the header line', (n) => 'ishikawa-beta ' + 'x '.repeat(n / 2)],
  ['a long line with inline comments', (n) => H + '  A' + ' %% c'.repeat(n / 5)],
  ['a long line with line separators', (n) => H + '  A' + '\u2028x'.repeat(n / 2)],
  [
    'header comments split by line separators',
    (n) => 'ishikawa-beta %% c' + '\u2028%% c'.repeat(n / 5),
  ],
  ['a long blank run before a comment', (n) => H + ' '.repeat(n) + '%% c'],
  ['bare percent lines', (n) => H + '%%\n'.repeat(n / 3)],
  ['indented bare percent lines', (n) => H + '   %%\n'.repeat(n / 6)],
  ['comment lines', (n) => H + '  %% c\n'.repeat(n / 7)],
  ['keyword lines', (n) => H + '  ishikawa\n'.repeat(n / 11)],
  ['near-keyword lines', (n) => H + '  ishikawax\n  ishikawa-bet\n'.repeat(n / 26)],
  ['entities', (n) => H + '  A' + ' #35;'.repeat(n / 5)],
  ['style-like lines', (n) => H + '  style a:#f00;\n'.repeat(n / 16)],
  ['CRLF lines', (n) => H + '  A\r\n'.repeat(n / 5)],
  ['CR lines', (n) => H + '  A\r'.repeat(n / 4)],
  ['CRLF lines split by comment lines', (n) => H + '  A\r\n%% c\r\n'.repeat(n / 11)],
  ['mid-line directives', (n) => H + '  A%%{init: {}}%%B\n'.repeat(n / 19)],
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

describe('stress: the ishikawa lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(10_000);
      const large = build(80_000);
      ishikawaTokens(small); // warm up
      ishikawaTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => ishikawaTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => ishikawaTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );

  it('lexes 80k cause lines, three tokens each', () => {
    // ISHIKAWA NL SPACELIST TEXT, then NL SPACELIST TEXT per line, then NL (the appended line
    // break) and EOF.
    const tokens = ishikawaTokens('ishikawa-beta\n  P' + '\n  A'.repeat(80_000));
    expect(tokens).toHaveLength(4 + 3 * 80_000 + 2);
  });
});
