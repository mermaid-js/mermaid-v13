import { describe, expect, it } from 'vitest';
import { wardleyTokens } from '@mermaid-js/diagram-wardley/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the wardley lexer is linear in input size, in every rule. v12's lexer
 * is quadratic on lines of unclosed `accDescr {` (each rescans to the end for a `}`: 20k lines
 * 146 ms, 40k 330 ms, spec #430). Shape copied from `../radar/stress.spec.ts` (pie's pattern):
 * n and 8n units; linear is ~8x, quadratic ~64x, and the bar is 24x. Each shape's `n` is picked
 * so its small lex costs about 3–4 ms here, so a mildly quadratic scan fails the bar, and the
 * file stays fast enough for PR CI. Timed by `linearRatio` (../linear-time.ts): this thread's
 * CPU time, windows of repeated runs well above the clock's step, best of five, small and large
 * alternating. Not measured on a steady machine: the bar is a ratio.
 */
const H = 'wardley-beta\n';
const C = H + 'component A [';
/**
 * `[name, build, n]`: `build(n)` is about `n` characters, lexed at `n` and `8n`. Native
 * `indexOf` hides the quadratic `}` search at 32k characters (its `}`-memo mutant passes there),
 * so the unclosed-`accDescr {` lines run at 64k and 512k, about 10 ms for the small lex.
 */
const SHAPES: [name: string, build: (n: number) => string, small: number][] = [
  ['lines of unclosed accDescr {', (n) => H + 'accDescr {\n'.repeat(n / 11), 64_000],
  ['unclosed accDescr { on one line', (n) => H + 'accDescr {'.repeat(n / 10), 32_000],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x', 64_000],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n), 8_000],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x', 96_000],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n / 2), 64_000],
  ['a long name', (n) => H + 'component ' + 'a'.repeat(n), 192_000],
  ['a long name of words', (n) => H + 'component ' + 'ab '.repeat(n / 3) + '[0.5, 0.5]', 48_000],
  [
    'a name, then a long blank run',
    (n) => H + 'component a' + ' '.repeat(n) + '[0.5, 0.5]',
    96_000,
  ],
  ['blank runs between names', (n) => H + 'component a' + ' 1'.repeat(n / 7), 32_000],
  ['a name of dashes', (n) => H + 'component a' + '-'.repeat(n), 24_000],
  ['a name of dashes before an arrow', (n) => H + 'a' + '-'.repeat(n) + '>b', 24_000],
  ['ids of dashes, never ended', (n) => H + '_' + '-'.repeat(n), 12_000],
  ['dash runs', (n) => H + '-'.repeat(n), 16_000],
  ['keyword-prefixed names', (n) => H + 'component ' + 'notebook buyer '.repeat(n / 15), 96_000],
  ['blank lines', (n) => H + '\n'.repeat(n), 8_000],
  ['blank runs', (n) => H + ' \t'.repeat(n / 2) + 'x', 192_000],
  ['a long zero run', (n) => C + '0'.repeat(n), 8_000],
  ['a long zero run before a dot', (n) => C + '0'.repeat(n) + '.', 8_000],
  ['a long digit run before a dot', (n) => C + '1'.repeat(n) + '.', 192_000],
  ['a long decimal', (n) => C + '0.' + '5'.repeat(n), 192_000],
  ['zero runs split by dots', (n) => C + '00.'.repeat(n / 3), 24_000],
  ['decimals', (n) => C + '0.5, '.repeat(n / 5), 24_000],
  ['an unterminated double quote', (n) => H + 'component "' + 'x'.repeat(n), 96_000],
  ['escaped quotes, never closed', (n) => H + 'component "' + '\\"'.repeat(n / 2), 8_000],
  ['escaped single quotes, never closed', (n) => H + "component '" + "\\'".repeat(n / 2), 8_000],
  ['quoted names', (n) => H + 'component "a" [0.5, 0.5]\n'.repeat(n / 25), 24_000],
  ['a label split by comment lines', (n) => H + 'note "' + 'x\n%% c\n'.repeat(n / 7), 16_000],
  ['port labels, never closed', (n) => H + "A +'" + 'x'.repeat(n), 96_000],
  ['port labels with no arrow', (n) => H + "A +'x'".repeat(n / 6), 12_000],
  ['link labels', (n) => H + 'A -> B; ' + 'x'.repeat(n), 96_000],
  ['YAML openers on every other line', (n) => H + '---\nx\n'.repeat(n / 6), 32_000],
  ['a YAML block, never closed', (n) => H + '---\n' + 'x\n'.repeat(n / 2), 8_000],
  ['directive openers, never closed', (n) => H + 'component A %%{ !\n'.repeat(n / 18), 24_000],
  ['directive closers that fail', (n) => H + 'component A %%{' + '}%%x'.repeat(n / 4), 64_000],
  ['characters no rule takes', (n) => H + 'component A' + ':'.repeat(n), 8_000],
  ['CRLF statements', (n) => H + 'component A [0.5, 0.5]\r\n'.repeat(n / 24), 24_000],
  ['entities in labels', (n) => H + 'note "' + '#a;'.repeat(n / 3) + '" [0.5, 0.5]', 64_000],
];

describe('stress: the wardley lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      expect(
        linearRatio(
          () => wardleyTokens(small),
          () => wardleyTokens(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
