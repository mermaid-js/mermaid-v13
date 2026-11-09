import { describe, expect, it } from 'vitest';
import { usecaseTokens } from '@mermaid-js/diagram-usecase/testing';

/**
 * R-PARSE-7, pitfall 5: the usecase lexer is linear in input size, in every rule. v12's lexer is
 * quadratic on lines of `<<` without `>>` (each searches the rest of the input for `>>`) and on
 * lines of unclosed `accDescr {` (each searches for `}`), and its parser's labelled-arrow
 * lookahead scans ahead from every `--` (spec #517); the first three shapes are those. Shape
 * copied from `../wardley/stress.spec.ts` (pie's pattern): n and 8n units; linear is ~8x,
 * quadratic ~64x, and the bar is 24x. Each shape's `n` is picked so its small lex costs a few
 * ms here, above the 2 ms floor of `Math.max(tSmall, 2)`. Times are this thread's CPU time, best
 * of five, and small and large lexes alternate. Not measured on a steady machine: the bar is a
 * ratio.
 */
const H = 'usecase-beta\n';
/**
 * `[name, build, n]`: `build(n)` is about `n` characters, lexed at `n` and `8n`. Native
 * `indexOf` hides v12's quadratic `>>` and `}` searches at 64k characters (their mutants pass
 * there), so the first two shapes run at 256k and 2M; at that size both mutants fail. No `n` is
 * above 256k, so the file stays fast enough for PR CI.
 */
const SHAPES: [name: string, build: (n: number) => string, small: number][] = [
  ['lines of << without >>', (n) => H + 'actor A <<x\n'.repeat(n / 12), 256_000],
  ['lines of unclosed accDescr {', (n) => H + 'accDescr {\n'.repeat(n / 11), 256_000],
  ['runs of --', (n) => H + 'A ' + '-- '.repeat(n / 3) + 'B', 128_000],
  ['<< without >> on one line', (n) => H + 'actor A ' + '<<x '.repeat(n / 4), 256_000],
  ['lines of << closed at the end', (n) => H + 'A <<x\n'.repeat(n / 6) + '>>', 64_000],
  ['lines of << then a line break', (n) => H + 'A <<\n'.repeat(n / 5), 64_000],
  ['a blank stereotype', (n) => H + 'A <<' + ' '.repeat(n) + '>>', 256_000],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x', 256_000],
  ['accDescr { closed at the end', (n) => H + 'accDescr {' + '\n'.repeat(n) + '}', 256_000],
  ['accTitle lines', (n) => H + 'accTitle: a title\n'.repeat(n / 18), 256_000],
  ['labelled arrows', (n) => H + 'A -- label --> B\n'.repeat(n / 17), 64_000],
  ['a dash run', (n) => H + 'A ' + '-'.repeat(n), 256_000],
  ['dash runs before >', (n) => H + ('A ' + '-'.repeat(40) + '> B\n').repeat(n / 46), 256_000],
  ['a long id', (n) => H + 'actor ' + 'a'.repeat(n), 256_000],
  ['a long CSS id', (n) => H + 'actor ' + 'a-'.repeat(n / 2) + 'a', 256_000],
  ['a CSS id without its dash word', (n) => H + 'a'.repeat(n) + '-', 256_000],
  ['keyword-prefixed ids', (n) => H + 'actors endpoint TBD '.repeat(n / 20), 256_000],
  ['a long number', (n) => H + 'style A width:' + '1'.repeat(n) + '.5px', 256_000],
  ['digits and dots', (n) => H + 'style A width:' + '1.'.repeat(n / 2), 64_000],
  ['blank lines', (n) => H + '\n'.repeat(n), 64_000],
  ['blank runs', (n) => H + ' \t'.repeat(n / 2) + 'x', 256_000],
  ['blanks before a comment', (n) => H + ' '.repeat(n) + '%%', 256_000],
  ['lines of %%', (n) => H + '  %%\n'.repeat(n / 5), 128_000],
  ['percent runs after a token', (n) => H + 'A ' + '%'.repeat(n), 32_000],
  ['an unclosed double quote', (n) => H + 'A("' + 'x'.repeat(n), 256_000],
  ['lines of unclosed quotes', (n) => H + 'A("x\n'.repeat(n / 5), 32_000],
  ['quotes, never closed', (n) => H + "A '" + '"'.repeat(n), 64_000],
  ['plain strings', (n) => H + '"a" --> \'b\'\n'.repeat(n / 12), 128_000],
  ['an unclosed markdown string', (n) => H + 'A("`' + 'x\n'.repeat(n / 2), 256_000],
  ['markdown openers, never closed', (n) => H + '"`x'.repeat(n / 3), 256_000],
  ['markdown strings', (n) => H + 'A("`**a**`")\n'.repeat(n / 13), 128_000],
  ['an unclosed JSON object', (n) => H + 'json P@{' + '{'.repeat(n), 256_000],
  ['a long JSON object', (n) => H + 'json P@{' + '"k": "} \\" {", '.repeat(n / 15) + '}', 256_000],
  ['JSON declarations without a body', (n) => H + 'json P @ x\n'.repeat(n / 11), 64_000],
  ['lines of # colours', (n) => H + 'style A fill:#f96,stroke:#333\n'.repeat(n / 30), 64_000],
  [
    'entities and colours',
    (n) => H + 'A[#amp; #9829; x] --> B\nstyle B fill:#f96\n'.repeat(n / 42),
    32_000,
  ],
  ['entities in labels', (n) => H + 'A[' + '#a; '.repeat(n / 4) + ']', 16_000],
  ['label symbols', (n) => H + 'A[' + '日本語 '.repeat(n / 4) + ']', 128_000],
  ['CRLF statements', (n) => H + 'actor A\r\nA --> B\r\n'.repeat(n / 18), 32_000],
  ['a label split by comment lines', (n) => H + 'A["' + 'x\n%% c\n'.repeat(n / 7), 64_000],
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

describe('stress: the usecase lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      usecaseTokens(small); // warm up
      usecaseTokens(large);
      let tSmall = Infinity;
      let tLarge = Infinity;
      for (let round = 0; round < 5; round++) {
        tSmall = Math.min(
          tSmall,
          cost(() => usecaseTokens(small))
        );
        tLarge = Math.min(
          tLarge,
          cost(() => usecaseTokens(large))
        );
      }
      expect(tLarge / Math.max(tSmall, 2)).toBeLessThan(24);
    },
    30_000
  );
});
