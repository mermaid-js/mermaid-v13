import { describe, expect, it } from 'vitest';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { journeyGateCorpus } from './corpus.ts';
import { excludeAccEof, v12Tokens, v13Tokens } from './gate.ts';

/**
 * Lexer-parity gate (parser-method §1, #310): the v13 journey lexer emits the same terminals,
 * with the same images, as v12's `journey.jison` lexer on the text v12 lexed. Tokens are
 * compared one for one; no runs are merged.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it.
 * In every state some journey rule matches, so jison never throws on journey text and v13
 * writes no `Error` token; one would still cut the v13 stream (`./gate.ts`).
 *
 * Exclusions (left out of the v13 stream, which keeps them as tokens):
 * - the `accDescr {` opener and its closing `}`: jison matches them and returns no token;
 * - comments (`%%` lines, and the `%…`, `x%%…` and `#…` comments jison's rules skip) and
 *   directives: v12 removed the first and last before lexing, and v13 writes all as trivia;
 * - the final `EOF` when the text ends inside an accessibility state (`accTitle:`, `accDescr:`
 *   or an unclosed `accDescr {` at the end): jison's value rule matched the empty input there,
 *   which set its `done` flag, so its next call returned `$end` without trying `<<EOF>>`. v13
 *   ends every stream in `EOF`; the parser (T2) decides what such a text means.
 * Empty-image tokens are not excluded: v13 writes the empty accessibility values at the end as
 * zero-width tokens of their own kinds, and `EOF` zero-width at the end of the source.
 */
describe('journey lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures, the v12 spec strings and variants', async () => {
    const oracle = await loadJisonLexerOracle('journey');
    const items = await journeyGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    let compared = 0;
    let e2e = 0;
    let excluded = 0;
    for (const item of items) {
      const expected = await v12Tokens(oracle, item.source);
      if (!expected) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (/^e2e\/[^(]*$/.test(item.id)) e2e++;
      const all = v13Tokens(item.source);
      const actual = excludeAccEof(expected, all);
      if (actual !== all) excluded++;
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    process.stdout.write(
      `journey lexer parity: ${compared} of ${items.length} sources lexed by v12 ` +
        `(${excluded} with the acc-state EOF exclusion); not: ${skipped.join(', ')}\n`
    );
    // Every e2e fixture reaches the journey lexer: the 18 v12 fixtures, the 17 #327 baselines
    // #649's long word and #769's tall labels.
    expect(e2e).toBe(37);
    expect(skipped).toEqual([]);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 240_000);
});
