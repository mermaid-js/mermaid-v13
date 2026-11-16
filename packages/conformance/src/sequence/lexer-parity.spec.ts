import { describe, expect, it } from 'vitest';
import { JISON_NAMES, sequenceTokens } from '@mermaid-js/diagram-sequence';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { sequenceGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1): the v13 sequence lexer emits the same terminals, with
 * the same images, as v12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (v13 writes an `Error` token there and carries on).
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing, and
 * the cases of `corpus/sequence-cases.json` (line-separator, edge and entity cases) are added.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - the `accDescr {` opener and its closing `}`: jison matches them and returns no token;
 * - comments (`%%` lines, and the `#…`, `%…` and `x%%…` comments jison's rules skip) and
 *   directives, which v13 writes as trivia.
 * Empty-image tokens are not excluded: v13 writes them as zero-width tokens of their own kinds
 * (`AliasEnd` for the alias state's empty match, `Eof` for `<<EOF>>`, and empty `restOfLine`
 * and accessibility values), so they compare as they are.
 */
function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of sequenceTokens(source)) {
    const name = JISON_NAMES[t.kind];
    if (!name) continue;
    if (name === LEXICAL_ERROR) {
      out.push([LEXICAL_ERROR, '']);
      break;
    }
    out.push([name, t.text]);
  }
  return out;
}

describe('sequence lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('sequence');
    const items = await sequenceGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    let compared = 0;
    let e2e = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) continue;
      compared++;
      if (item.id.startsWith('e2e') && !item.id.endsWith('(commented)')) e2e++;
      const expected = v12.map(([n, i]): JisonToken => [n, v12TokenText(i)]);
      const actual = v13Tokens(item.source);
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
    process.stdout.write(`lexer parity: ${compared} of ${items.length} sources lexed by v12\n`);
    // Every e2e fixture reaches the sequence lexer.
    expect(e2e).toBe(227);
    expect(compared).toBeGreaterThan(800);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
  }, 120_000);
});
