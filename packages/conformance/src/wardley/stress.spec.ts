import { describe, expect, it } from 'vitest';
import { wardleyTokens } from '@mermaid-js/diagram-wardley/testing';

/**
 * R-PARSE-7, pitfall 5: the wardley lexer is linear in input size, in every rule. v12's lexer
 * is quadratic on lines of unclosed `accDescr {` (each rescans to the end for a `}`: 20k lines
 * 146 ms, 40k 330 ms, spec #430). Shape copied from `../radar/stress.spec.ts` (pie's pattern):
 * n and 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x. Sizes are 64k and 512k
 * characters, times a shape's `scale`, picked so the small lex costs at least ~6 ms here (well
 * above the 2 ms floor of `Math.max(tSmall, 2)`, so a mildly quadratic scan fails the bar).
 * Times are this thread's CPU time, best of five, and small and large lexes alternate. Not
 * measured on a steady machine: the bar is a ratio.
 */
const H = 'wardley-beta\n';
const C = H + 'component A [';
/**
 * `[name, build, scale]`: `build(n)` is about `n` characters; a shape with a `scale` is lexed
 * at `scale` times the sizes (the cheap scans). Native `indexOf` hides the quadratic `}` search
 * below 32k characters, so the unclosed-`accDescr {` lines run at 256k and 2M.
 */
const SHAPES: [name: string, build: (n: number) => string, scale?: number][] = [
  ['lines of unclosed accDescr {', (n) => H + 'accDescr {\n'.repeat(n / 11), 4],
  ['unclosed accDescr { on one line', (n) => H + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x', 2],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n)],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x', 4],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n / 2), 2],
  ['a long name', (n) => H + 'component ' + 'a'.repeat(n), 8],
  ['a long name of words', (n) => H + 'component ' + 'ab '.repeat(n / 3) + '[0.5, 0.5]', 2],
  ['a name, then a long blank run', (n) => H + 'component a' + ' '.repeat(n) + '[0.5, 0.5]', 4],
  ['blank runs between names', (n) => H + 'component a' + '      1'.repeat(n / 7)],
  ['a name of dashes', (n) => H + 'component a' + '-'.repeat(n)],
  ['a name of dashes before an arrow', (n) => H + 'a' + '-'.repeat(n) + '>b'],
  ['ids of dashes, never ended', (n) => H + '_' + '-'.repeat(n)],
  ['dash runs', (n) => H + '-'.repeat(n)],
  ['keyword-prefixed names', (n) => H + 'component ' + 'notebook buyer '.repeat(n / 15), 4],
  ['blank lines', (n) => H + '\n'.repeat(n)],
  ['blank runs', (n) => H + ' \t'.repeat(n / 2) + 'x', 8],
  ['a long zero run', (n) => C + '0'.repeat(n)],
  ['a long zero run before a dot', (n) => C + '0'.repeat(n) + '.'],
  ['a long digit run before a dot', (n) => C + '1'.repeat(n) + '.', 8],
  ['a long decimal', (n) => C + '0.' + '5'.repeat(n), 8],
  ['zero runs split by dots', (n) => C + '00.'.repeat(n / 3)],
  ['decimals', (n) => C + '0.5, '.repeat(n / 5)],
  ['an unterminated double quote', (n) => H + 'component "' + 'x'.repeat(n), 4],
  ['escaped quotes, never closed', (n) => H + 'component "' + '\\"'.repeat(n / 2)],
  ['escaped single quotes, never closed', (n) => H + "component '" + "\\'".repeat(n / 2)],
  ['quoted names', (n) => H + 'component "a" [0.5, 0.5]\n'.repeat(n / 25)],
  ['a label split by comment lines', (n) => H + 'note "' + 'x\n%% c\n'.repeat(n / 7)],
  ['port labels, never closed', (n) => H + "A +'" + 'x'.repeat(n), 4],
  ['port labels with no arrow', (n) => H + "A +'x'".repeat(n / 6)],
  ['link labels', (n) => H + 'A -> B; ' + 'x'.repeat(n), 4],
  ['YAML openers on every other line', (n) => H + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => H + '---\n' + 'x\n'.repeat(n / 2)],
  ['directive openers, never closed', (n) => H + 'component A %%{ !\n'.repeat(n / 18)],
  ['directive closers that fail', (n) => H + 'component A %%{' + '}%%x'.repeat(n / 4), 2],
  ['characters no rule takes', (n) => H + 'component A' + ':'.repeat(n)],
  ['CRLF statements', (n) => H + 'component A [0.5, 0.5]\r\n'.repeat(n / 24)],
  ['entities in labels', (n) => H + 'note "' + '#a;'.repeat(n / 3) + '" [0.5, 0.5]', 2],
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

describe('stress: the wardley lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(64_000 * scale);
      const large = build(512_000 * scale);
      wardleyTokens(small); // warm up
      wardleyTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => wardleyTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => wardleyTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    60_000
  );
});
