import { describe, expect, it } from 'vitest';
import { JISON_NAMES, timelineTokens } from '@mermaid-js/diagram-timeline';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { timelineGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, #308): the v13 timeline lexer emits the same terminals,
 * with the same images, as v12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`.
 *   Timeline's last rule `.` and `\s+` between them take every character, so jison never
 *   throws here; v13 maps its `Error` kind anyway.
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing, and
 * a set of line-separator cases.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - the `accDescr {` opener and its closing `}`: jison matches them and returns no token;
 * - comments (`%%` lines, and the `#…`, `%…` and `x%%…` comments jison's rules skip) and
 *   directives, which v13 writes as trivia.
 * Empty-image tokens are not excluded: v13 writes them as zero-width tokens of their own kinds
 * (`Eof` for `<<EOF>>`, the clipped appended `NEWLINE`, and empty accessibility values), so
 * they compare as they are.
 *
 * Sources v12 never lexed as a timeline (`oracle.tokens` is undefined: the detector
 * `/^\s*timeline/` is case-sensitive, so `TIMELINE` is another type) are skipped.
 */
/** The suffix of a generated variant's id. */
const VARIANT = / \((?:commented|CR cut|CR cut by a directive)\)$/;

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of timelineTokens(source)) {
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

describe('timeline lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('timeline');
    const items = await timelineGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
      }
      const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
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
    // Every e2e fixture and every harvested spec and syntax-page string reaches the lexer
    // (#649 added two long-word fixtures).
    expect(e2e).toBe(59);
    expect(specs).toBe(24);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // The only sources v12 does not lex (each is lexed as written above):
    // - commented copies of a body of two lines or fewer, where `%% cut` goes through the
    //   middle of the `timeline` header (v12 detects no timeline there);
    // - CR-cut copies of a source with a multi-line directive, which the inserted lines break.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    expect(
      skipped.filter((id) => {
        const original = byId.get(id.replace(VARIANT, '')) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        const directive = id.includes(' (CR cut') && /%%\{[^\n]*\n/.test(original);
        return !((header && !/^\s*timeline/.test(cut)) || directive);
      })
    ).toEqual([]);
    expect(skipped.length).toBeLessThan(8);
  }, 120_000);
});
