import { describe, expect, it } from 'vitest';
import { parseInfo } from '@mermaid-js/diagram-info';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the info lexer and parser are linear in input size, in every rule. The
 * lexer is pie's without pie's own rules, so the shapes are pie's (`../pie/stress.spec.ts`) for
 * the rules both share, plus the parser's recovery over many bad lines. n and 8n units; linear
 * is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five,
 * and small and large parses alternate. Not measured on a steady machine: the bar is a ratio.
 */
const SHAPES: [string, (n: number) => string][] = [
  ['unclosed accDescr bodies', (n) => 'info\n' + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blanks and no brace', (n) => 'info\naccDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => 'info\naccDescr' + '\n'.repeat(n)],
  ['a long accDescr body', (n) => 'info\naccDescr {' + ' a \n'.repeat(n / 4) + '}'],
  ['blanks before a title', (n) => 'info\n' + ' '.repeat(n) + 'title x'],
  ['blanks before a word', (n) => 'info\n' + ' '.repeat(n) + 'x'],
  ['accTitle then blanks and no colon', (n) => 'info\naccTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => 'info\ntitle ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => 'info\ntitle ' + '% '.repeat(n / 2)],
  ['many titles', (n) => 'info\n' + 'title x\n'.repeat(n / 8)],
  ['YAML openers on every other line', (n) => 'info\n' + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => 'info\n---\n' + 'x\n'.repeat(n / 2)],
  ['mid-line YAML openers, never closed', (n) => 'info\n' + 'title a ---\n'.repeat(n / 12)],
  ['directive openers, never closed', (n) => 'info\n' + 'title a %%{ !\n'.repeat(n / 14)],
  ['directive closers that fail', (n) => 'info %%{' + '}%%x'.repeat(n / 4)],
  ['a long trailing comment', (n) => 'info %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => 'info ' + ';'.repeat(n)],
  ['a bad word on every line', (n) => 'info\n' + 'nope\n'.repeat(n / 5)],
  ['showInfo on every line', (n) => 'info\n' + 'showInfo\n'.repeat(n / 9)],
  ['statements split by comment lines', (n) => 'info\n' + 'title a\n%% c\n'.repeat(n / 13)],
  ['CRLF statements', (n) => 'info\r\n' + 'title a\r\n'.repeat(n / 9)],
  ['entities in a title', (n) => 'info\ntitle ' + '#a;'.repeat(n / 3)],
];

describe('stress: the info parser is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseInfo(small),
          () => parseInfo(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
