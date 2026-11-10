import { describe, expect, it } from 'vitest';
import { gitGraphTokens } from '@mermaid-js/diagram-gitgraph/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the gitGraph lexer is linear in input size, in every rule: long blank
 * runs, long names (and keywords a long name starts with), digit runs, strings, accessibility
 * bodies, YAML, directives and comments. Shape copied from `../pie/stress.spec.ts`: n and 8n
 * units; linear is ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time,
 * best of five, and small and large lexes alternate. Not measured on a steady machine: the bar
 * is a ratio.
 */
const G = 'gitGraph\n';
const SHAPES: [string, (n: number) => string][] = [
  ['blanks before a word', (n) => G + ' '.repeat(n) + 'commit'],
  ['blanks before a title', (n) => G + ' '.repeat(n) + 'title x'],
  ['blank lines', (n) => G + ' \n'.repeat(n / 2) + 'commit'],
  ['a long name', (n) => G + 'branch ' + 'a'.repeat(n)],
  ['a long name after a keyword', (n) => G + 'commit' + 'x'.repeat(n)],
  ['keywords glued into one name', (n) => G + 'cherry-pick'.repeat(n / 11)],
  ['a name then a run of dots', (n) => G + 'branch a' + '.'.repeat(n)],
  ['a keyword then a run of slashes', (n) => G + 'commit' + '/'.repeat(n)],
  ['names of dots and slashes', (n) => G + 'branch ' + 'a./'.repeat(n / 3)],
  ['a long digit run before a dot', (n) => G + 'branch b order: ' + '1'.repeat(n) + '.'],
  ['a long zero run', (n) => G + 'branch b order: ' + '0'.repeat(n)],
  ['digits and dots', (n) => G + 'branch ' + '1.'.repeat(n / 2)],
  ['an unterminated double quote', (n) => G + 'commit msg:"' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => G + "commit msg:'" + 'x'.repeat(n)],
  ['escaped quotes, never closed', (n) => G + 'commit msg:"' + '\\"'.repeat(n / 2)],
  ['a string split by comment lines', (n) => G + 'commit msg:"' + 'x\n%% c\n'.repeat(n / 7) + '"'],
  ['unclosed accDescr bodies', (n) => G + 'accDescr {'.repeat(n / 10)],
  ['accDescr then blanks and no brace', (n) => G + 'accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => G + 'accDescr' + '\n'.repeat(n)],
  ['accTitle then blanks and no colon', (n) => G + 'accTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => G + 'title ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => G + 'title ' + '% '.repeat(n / 2)],
  ['YAML openers on every other line', (n) => G + '---\nx\n'.repeat(n / 6)],
  ['a YAML block, never closed', (n) => G + '---\n' + 'x\n'.repeat(n / 2)],
  ['directive openers, never closed', (n) => G + 'commit %%{ !\n'.repeat(n / 13)],
  ['directive closers that fail', (n) => G + 'commit %%{' + '}%%x'.repeat(n / 4)],
  ['a long trailing comment', (n) => G + 'commit %%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => G + 'commit' + ';'.repeat(n)],
  ['statements split by comment lines', (n) => G + 'commit id:"a"\n%% c\n'.repeat(n / 19)],
  ['CRLF statements', (n) => 'gitGraph\r\n' + 'commit\r\n'.repeat(n / 8)],
  ['entities in messages', (n) => G + 'commit msg:"' + '#a;'.repeat(n / 3) + '"'],
];

describe('stress: the gitGraph lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(4_000);
      const large = build(32_000);
      expect(
        linearRatio(
          () => gitGraphTokens(small),
          () => gitGraphTokens(large)
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
