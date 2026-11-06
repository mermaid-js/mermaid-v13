import { describe, expect, it } from 'vitest';
import { packetTokens } from '@mermaid-js/diagram-packet/testing';

/**
 * R-PARSE-7, pitfall 5: the packet lexer is linear in input size, in every rule. v12's lexer is
 * quadratic on a run of unclosed `accDescr {` (its ACC_DESCR rule searches for `}` from every
 * one) and on runs of escaped quotes. Shape from `../pie/stress.spec.ts`: n and 8n units; linear
 * is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five,
 * and small and large lexes alternate. Each measurement repeats its lex as often as the small
 * one needs to take at least {@link MIN_MS} (the same count for both), so the bar stays a ratio
 * of two times well above the timer's noise, never an absolute bound. Not measured on a steady
 * machine. The unclosed `accDescr {` shapes are timed at 32 times the size: without the memo
 * their quadratic part is a native `indexOf` for `}`, which only outweighs the per-token work
 * there (removing the memo fails them at that size, and not at the base one).
 */
const P = 'packet\n';
const SHAPES: [string, (n: number) => string, number?][] = [
  ['unclosed accDescr bodies', (n) => P + 'accDescr {'.repeat(n / 10), 32],
  ['unclosed accDescr bodies on lines', (n) => P + 'accDescr {\n'.repeat(n / 11), 32],
  ['accDescr then blanks and no brace', (n) => P + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => P + 'accDescr' + '\n'.repeat(n)],
  ['a long zero run', (n) => P + '0'.repeat(n)],
  ['a long digit run', (n) => P + '1'.repeat(n) + ': "a"'],
  ['a long digit run before a dot', (n) => P + '1'.repeat(n) + '.'],
  ['digit runs before dots', (n) => P + '12.'.repeat(n / 3)],
  ['a long blank run', (n) => P + ' '.repeat(n) + '0: "a"'],
  ['blanks before a title', (n) => P + ' '.repeat(n) + 'title x'],
  ['blanks before a word', (n) => P + ' '.repeat(n) + 'x'],
  ['blank lines', (n) => P + ' \n'.repeat(n / 2)],
  ['an unterminated double quote', (n) => P + '0: "' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => P + "0: '" + 'x'.repeat(n)],
  ['escaped quotes, never closed', (n) => P + '0: "' + '\\"'.repeat(n / 2)],
  ['escaped single quotes, never closed', (n) => P + "0: '" + "\\'".repeat(n / 2)],
  ['quotes, never closed', (n) => P + '"'.repeat(n)],
  ['a string split by comment lines', (n) => P + '0: "' + 'x\n%% c\n'.repeat(n / 7) + '"'],
  ['accTitle then blanks and no colon', (n) => P + 'accTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => P + 'title ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => P + 'title ' + '% '.repeat(n / 2)],
  ['dash runs', (n) => P + '-'.repeat(n)],
  ['dash runs on lines', (n) => P + '--\n'.repeat(n / 3)],
  ['plus runs', (n) => P + '+'.repeat(n)],
  ['YAML openers on every other line', (n) => P + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => P + '---\n' + 'x\n'.repeat(n / 2)],
  ['mid-line YAML openers, never closed', (n) => P + '0: "a" ---\n'.repeat(n / 11)],
  ['directive openers, never closed', (n) => P + '0: "a" %%{ !\n'.repeat(n / 12)],
  ['directive closers that fail', (n) => P + '0: "a" %%{' + '}%%x'.repeat(n / 4)],
  ['a long trailing comment', (n) => P + '0: "a" %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => P + '0' + ';'.repeat(n)],
  ['packet keywords glued to words', (n) => P + 'packetx'.repeat(n / 7)],
  ['fields', (n) => P + '0-7: "a"\n'.repeat(n / 9)],
  ['fields split by comment lines', (n) => P + '+8: "a"\n%% c\n'.repeat(n / 13)],
  ['CRLF fields', (n) => 'packet\r\n' + '+8: "a"\r\n'.repeat(n / 9)],
  ['entities in labels', (n) => P + '0: "' + '#a;'.repeat(n / 3) + '"'],
];

/** CPU ms of this thread (the process on Node versions without threadCpuUsage). */
const cpuMs = (): number => {
  const u =
    typeof process.threadCpuUsage === 'function' ? process.threadCpuUsage() : process.cpuUsage();
  return (u.user + u.system) / 1000;
};
/** CPU ms of `reps` runs of `run`. */
const cost = (run: () => unknown, reps: number): number => {
  const t0 = cpuMs();
  for (let k = 0; k < reps; k++) run();
  return cpuMs() - t0;
};
/** The shortest small measurement. */
const MIN_MS = 8;
/** How many runs of `run` take at least {@link MIN_MS}. */
const repeatsFor = (run: () => unknown): number => {
  let reps = 1;
  while (cost(run, reps) < MIN_MS) reps *= 2;
  return reps;
};

describe('stress: the packet lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      packetTokens(large); // warm up
      const reps = repeatsFor(() => packetTokens(small));
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => packetTokens(small), reps)
        );
        tLarge = Math.min(
          tLarge,
          cost(() => packetTokens(large), reps)
        );
      }
      expect(tLarge / tSmall).toBeLessThan(24);
    },
    30_000
  );
});
