import { describe, expect, it } from 'vitest';
import { eventModelingTokens } from '@mermaid-js/diagram-eventmodeling/testing';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the event modeling lexer is linear in input size, in every rule. v12's
 * lexer is quadratic on lines of unclosed `{` (EM_DATA_BLOCK rescans to the end for a closing
 * line), of unclosed `/*`, of unclosed `accDescr {` and of unclosed `%%{`, and on a line of `{`
 * with no `}` (EM_DATA_INLINE rescans the line from each). Shape copied from
 * `../treemap/stress.spec.ts` (pie's pattern): n and 8n units; linear is ~8x, quadratic ~64x,
 * and the bar is 24x, timed with `linearRatio` (`../linear-time.ts`). Not measured on a steady
 * machine: the bar is a ratio.
 */
const EM = 'eventmodeling\n';
const FRAME = EM + 'tf 01 cmd A ';
/**
 * `[name, build, scale]`: `build(n)` is about `n` characters; a shape with a `scale` is lexed
 * at `scale` times the sizes. Native `indexOf` hides a quadratic search for a closer below 32k
 * characters (radar's gate), so the unclosed-closer lines run at 64k and 512k.
 */
const SHAPES: [name: string, build: (n: number) => string, scale?: number][] = [
  ['lines of unclosed data blocks', (n) => EM + 'data D {\n'.repeat(n / 9), 16],
  ['lines of bare {', (n) => EM + '{\n'.repeat(n / 2), 16],
  ['data block closers that fail', (n) => EM + 'data D {\n' + '}x\n'.repeat(n / 3), 16],
  ['lines of unclosed /*', (n) => EM + '/* c\n'.repeat(n / 5), 16],
  ['unclosed /* on one line', (n) => EM + '/*'.repeat(n / 2), 16],
  // After a line break EM_WS takes the blanks too, so `accDescr` starts a line as a name: the
  // rule is reached only after a token on its line.
  ['lines of unclosed accDescr {', (n) => EM + 'A accDescr {\n'.repeat(n / 13), 16],
  ['unclosed accDescr { on one line', (n) => EM + ' accDescr {'.repeat(n / 11), 16],
  ['directive openers, never closed', (n) => FRAME + '%%{ !\n'.repeat(n / 6), 16],
  ['directive closers that fail', (n) => FRAME + '%%{' + '}%%x'.repeat(n / 4)],
  ['YAML openers, never closed', (n) => EM + '---\n'.repeat(n / 4), 16],
  ['YAML closers that fail', (n) => EM + '---\n' + '---x\n'.repeat(n / 5), 16],
  ['a line of { with no }', (n) => FRAME + '{ '.repeat(n / 2)],
  ['a line of { then a } on the next line', (n) => FRAME + '{ '.repeat(n / 2) + '\n}'],
  ['lines of { with no }', (n) => FRAME + '{ x {\n'.repeat(n / 6)],
  ['long inline data', (n) => FRAME + '{ ' + 'a: 1, '.repeat(n / 6) + '}'],
  ['inline data of braces', (n) => FRAME + '{' + '}{'.repeat(n / 2) + '}'],
  ['long quoted inline data', (n) => FRAME + '"' + 'x '.repeat(n / 2) + '"'],
  ['an unterminated double quote', (n) => FRAME + '"' + 'x'.repeat(n)],
  ['an unterminated single quote', (n) => FRAME + "'" + 'x'.repeat(n)],
  ['lines of unterminated quotes', (n) => EM + 'tf 01 cmd A "x\n'.repeat(n / 15)],
  // Written as escapes: a raw U+2028 or U+2029 reads as a blank in review.
  ['quotes split by line separators', (n) => FRAME + '"x\u2028'.repeat(n / 3)],
  ['braces split by paragraph separators', (n) => FRAME + '{x\u2029'.repeat(n / 3)],
  ['a long data block', (n) => EM + 'data D {\n' + '  a: 1\n'.repeat(n / 7) + '}'],
  ['data block lines of }', (n) => EM + 'data D {\n' + '}}\n'.repeat(n / 3) + '}'],
  ['a long block comment', (n) => EM + '/*' + ' * x\n'.repeat(n / 5) + '*/'],
  ['blanks before a title', (n) => EM + ' '.repeat(n) + 'title x'],
  ['blanks then no rule', (n) => EM + ' '.repeat(n) + '#'],
  ['blank lines', (n) => EM + '  \n'.repeat(n / 3) + 'tf 01 evt A'],
  ['accDescr then blanks and no brace', (n) => EM + ' accDescr' + ' '.repeat(n) + 'x'],
  ['accDescr then blank lines and no brace', (n) => EM + ' accDescr' + '\n'.repeat(n)],
  ['accTitle then blanks and no colon', (n) => EM + ' accTitle' + ' '.repeat(n) + 'x'],
  ['a long title', (n) => EM + ' title ' + 'x '.repeat(n / 2)],
  ['a title of percent signs', (n) => EM + ' title ' + '% '.repeat(n / 2)],
  ['titles on one line', (n) => EM + ' titlex'.repeat(n / 7)],
  ['a long name', (n) => FRAME.slice(0, -2) + 'a'.repeat(n)],
  ['a long qualified name', (n) => FRAME.slice(0, -2) + 'a.'.repeat(n / 2) + 'a'],
  ['a long digit run', (n) => EM + 'tf ' + '1'.repeat(n)],
  ['many frames', (n) => EM + 'tf 01 evt A ->> 02 [[D]]\n'.repeat(n / 25)],
  ['frames on one line', (n) => EM + 'tf 01 evt A '.repeat(n / 12)],
  ['frames split by comment lines', (n) => EM + 'tf 01 evt A\n%% c\n'.repeat(n / 17)],
  ['a long trailing comment', (n) => FRAME + '%%' + 'x'.repeat(n)],
  ['characters no rule takes', (n) => FRAME + '#'.repeat(n)],
  ['CRLF frames', (n) => 'eventmodeling\r\n' + 'tf 01 evt A\r\n'.repeat(n / 13)],
  ['entities in inline data', (n) => FRAME + '{' + '#a;'.repeat(n / 3) + '}'],
];

describe('stress: the event modeling lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build, scale = 1) => {
      const small = build(4_000 * scale);
      const large = build(32_000 * scale);
      expect(
        linearRatio(
          () => eventModelingTokens(small),
          () => eventModelingTokens(large),
          process.env.EVENTMODELING_STRESS_LOG ? _name : undefined
        )
      ).toBeLessThan(24);
    },
    30_000
  );
});
