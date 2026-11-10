import { describe, expect, it } from 'vitest';
import { vennTokens } from '@mermaid-js/diagram-venn';
import { linearRatio } from '../linear-time.ts';

/**
 * R-PARSE-7, pitfall 5: the venn lexer is linear in input size, in every rule that scans
 * free text, and without jison's `unput` (12.2.0 takes 0.5, 2.0 and 8.0 s on 20k, 40k and 80k
 * `set` lines). Shape from `../pie/stress.spec.ts`: n and 8n units, up to 80k lines; linear is
 * ~8x, quadratic ~64x, and the bar is 24x. Times are this thread's CPU time, best of five, and
 * small and large lexes alternate.
 */
const V = 'venn-beta\n';
const SHAPES: [string, (n: number) => string][] = [
  ['set lines', (n) => V + '  set A\n'.repeat(n)],
  ['set lines with sizes and labels', (n) => V + '  set A["a"]:1.5\n'.repeat(n / 2)],
  ['indented text lines', (n) => V + '  set A\n' + '    text a1["x"]\n'.repeat(n / 2)],
  ['indented text lines with indent mode off', (n) => V + '  title t\n' + '    text a\n'.repeat(n)],
  ['blank lines', (n) => V + '  set A\n' + '\n'.repeat(n) + '  text a'],
  ['blank lines with blanks', (n) => V + '  set A\n' + '   \n'.repeat(n) + '  text a'],
  ['a long indent', (n) => V + '  set A\n' + ' '.repeat(n) + 'text a'],
  ['a long indent before a non-text line', (n) => V + '  set A\n' + ' '.repeat(n) + 'textual'],
  ['blanks between tokens', (n) => V + '  set' + ' '.repeat(n) + 'A'],
  ['a long title', (n) => V + '  title ' + 'x '.repeat(n)],
  ['bare title lines', (n) => V + '  title\n'.repeat(n)],
  ['a long label', (n) => V + '  set A[' + 'x\n'.repeat(n) + ']'],
  ['an unclosed label', (n) => V + '  set A[' + 'x '.repeat(n)],
  ['open brackets', (n) => V + '  set A' + '['.repeat(n)],
  ['open brackets then a quote', (n) => V + '  set A' + '['.repeat(n) + '"'],
  ['a long quoted label', (n) => V + '  set A["' + 'x\n'.repeat(n) + '"]'],
  ['an unclosed quoted label', (n) => V + '  set A["' + 'x '.repeat(n)],
  ['quoted labels not closed by a bracket', (n) => V + '  set A' + '["x"'.repeat(n / 4)],
  ['a long string', (n) => V + '  set "' + 'x\n'.repeat(n) + '"'],
  ['an unclosed string', (n) => V + '  set "' + 'x '.repeat(n)],
  ['many strings', (n) => V + '  style A k:' + '"x"'.repeat(n / 3)],
  ['a long identifier', (n) => V + '  set A' + 'a-'.repeat(n)],
  ['a long number', (n) => V + '  set A:' + '1'.repeat(n) + '.' + '2'.repeat(n)],
  ['a long rgb', (n) => V + '  style A fill:rgba(' + ' \n'.repeat(n) + '1,2,3,4)'],
  ['an unclosed rgb', (n) => V + '  style A fill:rgba(' + ' '.repeat(n)],
  ['failed rgb calls', (n) => V + '  style A fill:' + 'rgb(1, 2,'.repeat(n / 10)],
  ['hex colours', (n) => V + '  style A fill:' + '#123456789 '.repeat(n / 11)],
  ['glued comments', (n) => V + '  set AB%% c\n'.repeat(n / 2)],
  ['comments after statements', (n) => V + '  set A %% c\n'.repeat(n / 2)],
  ['a long comment', (n) => V + '  set A %%' + 'x'.repeat(n)],
  ['bare percent lines', (n) => V + '  set A\n' + '%%\n'.repeat(n)],
  ['entities in labels', (n) => V + '  set A[' + '#35;'.repeat(n / 4) + ']'],
  ['entities as errors', (n) => V + '  set A ' + '#a;'.repeat(n / 3)],
  ['errors', (n) => V + '  set A ' + '@'.repeat(n)],
  ['CRLF lines', (n) => V + '  set A\r\n'.repeat(n / 2)],
  ['CRLF lines split by comment lines', (n) => V + '  set A\r\n%% c\r\n'.repeat(n / 2)],
  [
    'a style line, then CRLF lines split by comment lines',
    (n) => V + '  style A fill:#f;\r\n' + '  set A\r\n%% c\r\n'.repeat(n / 2),
  ],
];

describe('stress: the venn lexer is linear in input size', () => {
  it.each(SHAPES)(
    '%s',
    (_name, build) => {
      const small = build(10_000);
      const large = build(80_000);
      expect(
        linearRatio(
          () => vennTokens(small),
          () => vennTokens(large)
        )
      ).toBeLessThan(24);
    },
    60_000
  );

  it('lexes 80k `set` lines, three tokens each', () => {
    // VENN NEWLINE, then SET IDENTIFIER NEWLINE per line, then EOF.
    const tokens = vennTokens(V + '  set A\n'.repeat(80_000));
    expect(tokens).toHaveLength(3 + 3 * 80_000);
  });
});
