import { describe, expect, it } from 'vitest';
import { architectureTokens } from '@mermaid-js/diagram-architecture/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the architecture lexer is linear in input size, in every rule (spec #525
 * T1: unclosed `accDescr {`, long labels and unterminated quotes). v12's lexer is quadratic on
 * lines of unclosed `accDescr {` (each rescans to the end for a `}`) and on lines that open a
 * quoted label or string and never close it (each rescans to the end for a quote). Shape copied
 * from `../wardley/stress.spec.ts` (pie's pattern): n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Each shape's `n` is picked so its small lex costs a few ms here,
 * so a mildly quadratic scan fails the bar. Timed by `linearRatio` (`../linear-time.ts`: this
 * thread's CPU time over windows of repeated runs, best of five, small and large alternating).
 * Not measured on a steady machine: the bar is a ratio.
 */
const H = 'architecture-beta\n';
/**
 * `[name, build, n]`: `build(n)` is about `n` characters, lexed at `n` and `8n`. Native
 * `indexOf` hides a quadratic `}` search at 32k characters, so the unclosed-`accDescr {` lines
 * run at 64k and 512k.
 */
const SHAPES: [name: string, build: (n: number) => string, small: number][] = [
  ['lines of unclosed accDescr {', (n) => H + 'accDescr {\n'.repeat(n / 11), 64_000],
  ['unclosed accDescr { on one line', (n) => H + 'accDescr {'.repeat(n / 10), 32_000],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x', 64_000],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n), 8_000],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x', 96_000],
  ['blanks then title-prefixed names', (n) => H + ' titlex'.repeat(n / 7), 32_000],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n / 2), 64_000],
  ['a long label', (n) => H + 'service a[' + 'x '.repeat(n / 2) + ']', 96_000],
  ['a long label, never closed', (n) => H + 'service a[' + 'x '.repeat(n / 2), 12_000],
  ['lines of unclosed labels', (n) => H + 'service a[x\n'.repeat(n / 12), 24_000],
  ['label openers on one line', (n) => H + 'service a' + '[x'.repeat(n / 2), 12_000],
  ['a long quoted label', (n) => H + 'service a["' + 'x]['.repeat(n / 3) + '"]', 192_000],
  ['a quoted label, never closed', (n) => H + 'service a["' + 'x'.repeat(n), 48_000],
  ['lines of unclosed quoted labels', (n) => H + 'service a["x\n'.repeat(n / 13), 24_000],
  ['quoted labels closed without ]', (n) => H + 'service a["x"y\n'.repeat(n / 15), 24_000],
  ['lines of unclosed single-quoted labels', (n) => H + "service a['x\n".repeat(n / 13), 24_000],
  ['an unterminated double quote', (n) => H + 'service a "' + 'x'.repeat(n), 96_000],
  ['lines of unterminated quotes', (n) => H + 'service a "x\n'.repeat(n / 13), 24_000],
  ['escaped quotes, never closed', (n) => H + 'service a "' + '\\"'.repeat(n / 2), 8_000],
  ['escaped single quotes, never closed', (n) => H + "service a '" + "\\'".repeat(n / 2), 8_000],
  ['a long icon', (n) => H + 'service a(' + 'x'.repeat(n) + ')', 192_000],
  ['an icon, never closed', (n) => H + 'service a(' + 'x'.repeat(n), 192_000],
  ['icon openers', (n) => H + 'service a' + '(x'.repeat(n / 2), 12_000],
  ['a long id', (n) => H + 'service ' + 'a'.repeat(n), 192_000],
  ['an id of dashes, never ended', (n) => H + 'service _' + '-'.repeat(n), 24_000],
  ['keyword-prefixed ids', (n) => H + 'service ' + 'services rows inx '.repeat(n / 18), 48_000],
  ['capital-prefixed ids', (n) => H + 'service ' + 'Backend '.repeat(n / 8), 48_000],
  ['edges', (n) => H + 'a{group}:R <-[x]-> L:b\n'.repeat(n / 22), 24_000],
  ['dash runs', (n) => H + '-'.repeat(n), 24_000],
  ['blank lines', (n) => H + '\n'.repeat(n), 8_000],
  ['blank runs', (n) => H + ' \t'.repeat(n / 2) + 'x', 192_000],
  ['YAML openers on every other line', (n) => H + '---\nx\n'.repeat(n / 6), 32_000],
  ['a YAML block, never closed', (n) => H + '---\n' + 'x\n'.repeat(n / 2), 8_000],
  ['directive openers, never closed', (n) => H + 'service a %%{ !\n'.repeat(n / 16), 24_000],
  ['directive closers that fail', (n) => H + 'service a %%{' + '}%%x'.repeat(n / 4), 64_000],
  ['characters no rule takes', (n) => H + 'service a' + '*'.repeat(n), 8_000],
  ['group openers that fail', (n) => H + 'a' + '{grou'.repeat(n / 5), 32_000],
  ['CRLF statements', (n) => H + 'service a(server)[A]\r\n'.repeat(n / 22), 24_000],
  ['entities in labels', (n) => H + 'service a[' + '#a;'.repeat(n / 3) + ']', 64_000],
];

describe('stress: the architecture lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, n) => {
      const small = build(n);
      const large = build(8 * n);
      expect(
        linearRatio(
          () => architectureTokens(small),
          () => architectureTokens(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
