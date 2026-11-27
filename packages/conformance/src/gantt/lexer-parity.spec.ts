import { describe, expect, it } from 'vitest';
import { ganttTokens, JISON_NAMES } from '@mermaid-js/diagram-gantt';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { ganttGateCorpus } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, #377): the v13 gantt lexer emits the same terminals,
 * with the same images, as v12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`.
 *   The only one is the token after `%%{` (jison's first rule begins a start condition the
 *   grammar never declares); v13 writes an `Error` token there.
 *
 * Every source is also lexed with comment lines added, which v12 removed before lexing, with
 * its line breaks written as CRs cut by a comment or a directive, and a set of line-separator
 * cases.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - the openers and closers of the `click`, `href`, `callbackname` and `callbackargs` states
 *   (`click `, `href "`, `"`, `call `, `(`, `()`, `)`, and the one blank or line break that ends
 *   the click ids): jison matches them and returns no token;
 * - the `accDescr {` opener and its closing `}`, for the same reason;
 * - comments (`%%` lines, and the `%…` and `x%…` comments jison's rules skip) and directives,
 *   which v13 writes as trivia, and a dropped `;` no token took.
 * Empty-image tokens are not excluded: v13 writes them as zero-width tokens of their own kinds
 * (`Eof` for `<<EOF>>`, the clipped appended `NL`, and the empty value a state's last rule
 * matches at the end of the text), so they compare as they are.
 *
 * Sources v12 never lexed as a gantt (`oracle.tokens` is undefined) are skipped; the list of
 * them is checked below.
 *
 * Not in the gate: an unclosed `%%{word` directive. v12's directive regex removed it with more
 * of the text after it than v13's preprocess does (a decided preprocess divergence, see
 * `divergences/` `quadrant-cases/unclosed-directive`), so the two lexers see different
 * text there.
 */
/** The sources v12 does not lex as a gantt (see the end of the gate). */
const SKIPPED = [
  // `gantt\n` and `gantt`: the comment line goes through the header.
  'gantt-cases/empty (commented)',
  'gantt-cases/empty-without-line-break (commented)',
];

/** The suffix of a generated variant's id. */
const VARIANT = / \((?:commented|CR cut|CR cut by a directive)\)$/;

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of ganttTokens(source)) {
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

describe('gantt lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the e2e fixtures and the v12 spec strings', async () => {
    const oracle = await loadJisonLexerOracle('gantt');
    const items = await ganttGateCorpus();
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
    // Every e2e fixture and every harvested spec and syntax-page string reaches the lexer.
    expect(e2e).toBe(98);
    expect(specs).toBe(41);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // The only sources v12 does not lex: commented copies of a body of two lines or fewer,
    // where `%% cut` goes through the middle of the `gantt` header (v12 detects no gantt there).
    expect(skipped).toEqual(SKIPPED);
  }, 300_000);
});
