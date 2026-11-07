import { describe, expect, it } from 'vitest';
import { radarTokens } from '@mermaid-js/diagram-radar/testing';

/**
 * R-PARSE-7, pitfall 5: the radar lexer is linear in input size, in every rule. v12's lexer is
 * quadratic on a long zero run (FLOAT rescans the run from every zero: 10k zeros 51 ms, 40k
 * 1.25 s) and on lines of unclosed `accDescr {` (each rescans to the end for a `}`: 2k lines
 * 20 ms, 8k 486 ms), spec #422. Shape copied from `../pie/stress.spec.ts`: n and 8n units;
 * linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of
 * five, and small and large lexes alternate. Not measured on a steady machine: the bar is a
 * ratio.
 */
const CURVE = 'radar-beta\naxis A\ncurve c{';
/**
 * `[name, build, scale]`: `build(n)` is about `n` characters; a shape with a `scale` is lexed
 * at `scale` times the sizes. Native `indexOf` hides the quadratic `}` search below 32k
 * characters, so the unclosed-`accDescr {` lines run at 64k and 512k.
 */
const SHAPES: [name: string, build: (n: number) => string, scale?: number][] = [
  ['a long zero run', (n) => CURVE + '0'.repeat(n)],
  ['a long zero run before a dot', (n) => CURVE + '0'.repeat(n) + '.'],
  ['a long digit run before a dot', (n) => CURVE + '1'.repeat(n) + '.'],
  ['a long fraction before a dot', (n) => CURVE + '1.' + '2'.repeat(n) + '.'],
  ['zero runs split by dots', (n) => CURVE + '00.'.repeat(n / 3)],
  ['lines of unclosed accDescr {', (n) => 'radar-beta\n' + 'accDescr {\n'.repeat(n / 11), 16],
  ['unclosed accDescr { on one line', (n) => 'radar-beta\n' + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blanks and no brace', (n) => 'radar-beta\naccDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => 'radar-beta\naccDescr' + '\n'.repeat(n)],
  ['blanks before a title', (n) => 'radar-beta\n' + ' '.repeat(n) + 'title x'],
  ['blanks before a name', (n) => 'radar-beta\n' + ' '.repeat(n) + 'x'],
  ['accTitle then blanks and no colon', (n) => 'radar-beta\naccTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => 'radar-beta\ntitle ' + 'x '.repeat(n / 2)],
  ['a long name', (n) => 'radar-beta\naxis ' + 'a'.repeat(n)],
  ['a name of dashes', (n) => 'radar-beta\naxis a' + '-'.repeat(n)],
  ['names of dashes, never ended', (n) => 'radar-beta\naxis ' + 'a-'.repeat(n / 2) + '-'],
  ['keyword-prefixed names', (n) => 'radar-beta\naxis ' + 'maxi, circles, '.repeat(n / 15)],
  ['an unterminated double quote', (n) => 'radar-beta\naxis A["' + 'x'.repeat(n)],
  ['escaped quotes, never closed', (n) => 'radar-beta\naxis A["' + '\\"'.repeat(n / 2)],
  ['escaped single quotes, never closed', (n) => "radar-beta\naxis A['" + "\\'".repeat(n / 2)],
  ['a label split by comment lines', (n) => 'radar-beta\naxis A["' + 'x\n%% c\n'.repeat(n / 7)],
  ['YAML openers on every other line', (n) => 'radar-beta\n' + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => 'radar-beta\n---\n' + 'x\n'.repeat(n / 2)],
  ['directive openers, never closed', (n) => 'radar-beta\n' + 'axis A %%{ !\n'.repeat(n / 13)],
  ['directive closers that fail', (n) => 'radar-beta\naxis A %%{' + '}%%x'.repeat(n / 4)],
  ['characters no rule takes', (n) => CURVE + '1' + ';'.repeat(n)],
  ['many entries', (n) => CURVE + '1, '.repeat(n / 3) + '}'],
  ['CRLF statements', (n) => 'radar-beta\r\n' + 'axis A\r\n'.repeat(n / 8)],
  ['entities in labels', (n) => 'radar-beta\naxis A["' + '#a;'.repeat(n / 3) + '"]'],
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

describe('stress: the radar lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      radarTokens(small); // warm up
      radarTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => radarTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => radarTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
