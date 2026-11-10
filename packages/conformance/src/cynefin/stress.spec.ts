import { describe, expect, it } from 'vitest';
import { cynefinTokens } from '@mermaid-js/diagram-cynefin/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the cynefin lexer is linear in input size, in every rule. v12's lexer is
 * quadratic on unterminated `%%{` in the middle of lines (its directive rule searches the rest
 * of the text for `}%%` from each one: 2.5k, 5k and 10k take 4, 18 and 69 ms, #423). Shape
 * copied from `../pie/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic ~64x, and the
 * bar is 24x. Times are this thread's CPU time, best of five, and small and large lexes
 * alternate. Not measured on a steady machine: the bar is a ratio.
 */
const H = 'cynefin-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['mid-line directive openers, never closed', (n) => H + 'complex %%{ x\n'.repeat(n / 14)],
  ['directive openers on one line, never closed', (n) => H + 'complex ' + '%%{'.repeat(n / 3)],
  ['directive closers that fail', (n) => H + 'complex %%{' + '}%%x'.repeat(n / 4)],
  ['mid-line directives that fail, one per line', (n) => H + 'complex %%{}%%x\n'.repeat(n / 16)],
  ['an unterminated double quote', (n) => H + 'complex\n"' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => H + "complex\n'" + 'x'.repeat(n)],
  ['unterminated quotes on every line', (n) => H + 'complex\n' + '"x\n'.repeat(n / 3)],
  ['escaped quotes, never closed', (n) => H + 'complex\n"' + '\\"'.repeat(n / 2)],
  ['a string split by comment lines', (n) => H + 'complex\n"' + 'x\n%% c\n'.repeat(n / 7) + '"'],
  ['unclosed accDescr bodies', (n) => H + 'accDescr {'.repeat(n / 10)],
  ['unclosed accDescr bodies on lines', (n) => H + 'accDescr {\n'.repeat(n / 11)],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n)],
  ['compl runs', (n) => H + 'compl'.repeat(n / 5)],
  ['compl runs on lines', (n) => H + 'compl\n'.repeat(n / 6)],
  ['domain names glued', (n) => H + 'complex'.repeat(n / 7)],
  ['header prefixes', (n) => H + 'cynefin-bet'.repeat(n / 11)],
  ['arrow prefixes', (n) => H + 'complex ' + '--'.repeat(n / 2)],
  ['items, one per line (10k at 8n)', (n) => H + 'complex\n' + '  "a"\n'.repeat((n * 10) / 32)],
  ['items on one line', (n) => H + 'complex' + ' "a"'.repeat(n / 4)],
  ['transitions', (n) => H + 'complex --> clear : "x"\n'.repeat(n / 24)],
  ['blanks before a title', (n) => H + ' '.repeat(n) + 'title x'],
  ['blanks before a word', (n) => H + ' '.repeat(n) + 'x'],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => H + 'title ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => H + 'title ' + '% '.repeat(n / 2)],
  ['YAML openers on every other line', (n) => H + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => H + '---\n' + 'x\n'.repeat(n / 2)],
  ['mid-line YAML openers, never closed', (n) => H + 'complex ---\n'.repeat(n / 12)],
  ['a long trailing comment', (n) => H + 'complex %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => H + 'complex' + ';'.repeat(n)],
  ['items split by comment lines', (n) => H + 'complex\n' + '"a"\n%% c\n'.repeat(n / 10)],
  ['CRLF items', (n) => 'cynefin-beta\r\ncomplex\r\n' + '"a"\r\n'.repeat(n / 5)],
  ['entities in items', (n) => H + 'complex\n"' + '#a;'.repeat(n / 3) + '"'],
];

describe('stress: the cynefin lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => cynefinTokens(small),
          () => cynefinTokens(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
