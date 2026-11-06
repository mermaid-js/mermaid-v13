import { describe, expect, it } from 'vitest';
import { pieTokens } from '@mermaid-js/diagram-pie/testing';

/**
 * R-PARSE-7, pitfall 5: the pie lexer is linear in input size, in every rule. v12's lexer is
 * quadratic on a long zero run (its number rule rescans the run from every zero) and on runs of
 * escaped quotes. Shape copied from `../sequence/stress.spec.ts`: n and 8n units; linear is
 * ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, and
 * small and large lexes alternate. Not measured on a steady machine: the bar is a ratio.
 */
const PIE = 'pie\n"a": ';
const SHAPES: [string, (n: number) => string][] = [
  ['a long zero run', (n) => PIE + '0'.repeat(n)],
  ['a long digit run before a dot', (n) => PIE + '1'.repeat(n) + '.'],
  ['a long fraction before a dot', (n) => PIE + '1.' + '2'.repeat(n) + '.'],
  ['zero runs with minus signs', (n) => PIE + '-0'.repeat(n / 2)],
  ['an unterminated double quote', (n) => 'pie\n"' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => "pie\n'" + 'x'.repeat(n)],
  ['escaped quotes, never closed', (n) => 'pie\n"' + '\\"'.repeat(n / 2)],
  ['escaped single quotes, never closed', (n) => "pie\n'" + "\\'".repeat(n / 2)],
  ['a string split by comment lines', (n) => 'pie\n"' + 'x\n%% c\n'.repeat(n / 7) + '": 1'],
  ['unclosed accDescr bodies', (n) => 'pie\n' + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blanks and no brace', (n) => 'pie\naccDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => 'pie\naccDescr' + '\n'.repeat(n)],
  ['blanks before a title', (n) => 'pie\n' + ' '.repeat(n) + 'title x'],
  ['blanks before a word', (n) => 'pie\n' + ' '.repeat(n) + 'x'],
  ['accTitle then blanks and no colon', (n) => 'pie\naccTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => 'pie\ntitle ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => 'pie\ntitle ' + '% '.repeat(n / 2)],
  ['YAML openers on every other line', (n) => 'pie\n' + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => 'pie\n---\n' + 'x\n'.repeat(n / 2)],
  ['mid-line YAML openers, never closed', (n) => 'pie\n' + '"a": 1 ---\n'.repeat(n / 12)],
  ['directive openers, never closed', (n) => 'pie\n' + '"a": 1 %%{ !\n'.repeat(n / 13)],
  ['directive closers that fail', (n) => 'pie\n"a": 1 %%{' + '}%%x'.repeat(n / 4)],
  ['a long trailing comment', (n) => PIE + '1 %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => PIE + '1' + ';'.repeat(n)],
  ['sections split by comment lines', (n) => 'pie\n' + '"a": 1\n%% c\n'.repeat(n / 13)],
  ['CRLF sections', (n) => 'pie\r\n' + '"a": 1\r\n'.repeat(n / 8)],
  ['entities in labels', (n) => 'pie\n"' + '#a;'.repeat(n / 3) + '": 1'],
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

describe('stress: the pie lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      pieTokens(small); // warm up
      pieTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => pieTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => pieTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
