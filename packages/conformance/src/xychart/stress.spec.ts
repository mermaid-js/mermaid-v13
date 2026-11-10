import { describe, expect, it } from 'vitest';
import { lexXyChart, parseXyChart } from '@mermaid-js/diagram-xychart';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the XY chart lexer is linear in input size, in every rule and state:
 * blank runs (before a closer, after a keyword that needs a colon or brace), digit runs (in
 * every state that lexes numbers), unterminated quotes and blocks, and strings split by comment
 * lines. Shape copied from `../pie/stress.spec.ts`: n and 8n units; linear is ~8x, quadratic
 * ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, and small and large
 * lexes alternate. Not measured on a steady machine: the bar is a ratio.
 */
const H = 'xychart\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks before a word', (n) => H + ' '.repeat(n) + 'x'],
  ['blanks before a closing bracket', (n) => H + 'bar [1' + ' '.repeat(n) + ']'],
  ['blanks before a band closer', (n) => H + 'x-axis [a' + ' '.repeat(n) + ']'],
  ['blank lines in data', (n) => H + 'bar [1,' + ' \n'.repeat(n / 2) + '2]'],
  ['accTitle then blanks and no colon', (n) => H + 'accTitle' + ' '.repeat(n) + 'x'],
  ['accDescr then blanks and no brace', (n) => H + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => H + 'accDescr' + '\n'.repeat(n)],
  ['repeated accDescr with blanks', (n) => H + 'accDescr   '.repeat(n / 11)],
  ['a long digit run', (n) => H + 'title ' + '1'.repeat(n)],
  ['a long digit run in data', (n) => H + 'bar [' + '1'.repeat(n) + ']'],
  ['a long digit run before a dot in data', (n) => H + 'bar [' + '1'.repeat(n) + '.]'],
  ['a long fraction in an axis range', (n) => H + 'y-axis 0.' + '5'.repeat(n) + ' --> 1'],
  ['signs without digits in data', (n) => H + 'bar [' + '+-'.repeat(n / 2) + ']'],
  ['dots without digits in data', (n) => H + 'bar [' + '.'.repeat(n) + ']'],
  ['dashes without > in an axis', (n) => H + 'x-axis a ' + '-'.repeat(n)],
  ['many numbers', (n) => H + 'bar [' + '1.5, '.repeat(n / 5) + '1]'],
  ['an unterminated quote', (n) => H + 'title "' + 'x '.repeat(n / 2)],
  ['an unterminated quote in data', (n) => H + 'bar [1 "' + 'x\n'.repeat(n / 2)],
  ['an unclosed accDescr block', (n) => H + 'accDescr {' + 'x\n'.repeat(n / 2)],
  ['unclosed accDescr blocks', (n) => H + 'accDescr {'.repeat(n / 10)],
  ['a long accTitle', (n) => H + 'accTitle: ' + 'x;'.repeat(n / 2)],
  ['a string split by comment lines', (n) => H + 'title "' + 'x\n%% c\n'.repeat(n / 7) + '"'],
  ['plots split by comment lines', (n) => H + 'bar [1]\n%% c\n'.repeat(n / 14)],
  ['glued comments', (n) => H + 'bar [1]%% c\n'.repeat(n / 12)],
  ['percent signs', (n) => H + 'title a' + '%'.repeat(n)],
  ['a long trailing comment', (n) => H + 'bar [1] %%' + 'x'.repeat(n)],
  ['backticks', (n) => H + 'title a' + '`)'.repeat(n / 2)],
  ['nested brackets', (n) => H + 'bar ' + '['.repeat(n)],
  ['keywords without a boundary', (n) => H + 'title ' + 'barx'.repeat(n / 4)],
  ['characters no rule takes', (n) => H + 'title a' + '('.repeat(n)],
  ['unclosed directives with word arguments', (n) => H + 'bar [1] %%{x y\n'.repeat(n / 15)],
  ['directive openers without a name', (n) => H + 'bar [1] ' + '%%{ '.repeat(n / 4)],
  ['an unclosed directive', (n) => H + 'bar [1] %%{x ' + 'a\n'.repeat(n / 2)],
  ['CRLF plots', (n) => 'xychart\r\n' + 'bar [1]\r\n'.repeat(n / 9)],
  ['entities in a string', (n) => H + 'title "' + '#a;'.repeat(n / 3) + '"'],
];

describe('stress: the XY chart lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => lexXyChart(small),
          () => lexXyChart(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});

/**
 * The parser and model builder are linear too (#508, pitfalls 11 and 19): many statements of
 * each kind, long plots against both axis kinds, plots before many axes (the warning's list),
 * and errors that recovery skips. Same ratio as above.
 */
const PARSE_SHAPES: [string, (n: number) => string][] = [
  ['many plots', (n) => H + 'bar [1, 2]\nline L [3 "p"]\n'.repeat(n / 26)],
  ['a long plot, inferred axes', (n) => H + 'line [' + '1.5, '.repeat(n / 5) + '1]'],
  ['many categories', (n) => H + 'x-axis [' + 'a, '.repeat(n / 3) + 'b]\nbar [1]'],
  [
    'a long plot on categories',
    (n) => H + 'x-axis [' + 'a, '.repeat(n / 6) + 'b]\nbar [' + '2, '.repeat(n / 6) + '1]',
  ],
  ['plots and axes alternating', (n) => H + 'bar [1]\nx-axis [a]\n'.repeat(n / 18)],
  ['repeated titles and axes', (n) => H + 'title t\ny-axis 0 --> 1\n'.repeat(n / 22) + 'bar [1]'],
  ['many errors', (n) => H + 'bar [x]\n'.repeat(n / 8)],
  ['statements with no separator', (n) => H + 'bar [1] '.repeat(n / 8)],
];

describe('stress: the XY chart parser is linear in input size', () => {
  it.each(PARSE_SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => parseXyChart(small),
          () => parseXyChart(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
