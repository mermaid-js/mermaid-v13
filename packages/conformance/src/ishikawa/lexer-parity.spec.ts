import { describe, expect, it } from 'vitest';
import { ishikawaTokens, JISON_NAMES } from '@mermaid-js/diagram-ishikawa';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { ishikawaGateCorpus, VARIANTS } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D212, #580): the v13 ishikawa lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `ishikawa.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('ishikawa')`, with the default `yy`: no lexer action reads it).
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - no input makes jison throw (every character matches `[\n]+` or `[^\n]+`), so no kind maps
 *   to `LEXICAL_ERROR`; the gate asserts that the oracle never ends a stream with one.
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, with every
 * indent removed, and with a directive through the middle of every line after the header
 * (pitfall 3's mid-line cut). The cases file holds the line-separator cases (pitfall 2).
 *
 * Exclusions:
 * - v13 kinds with no jison name, left out of the v13 stream: comments (the `%%` lines v12
 *   removed) and directives, which v13 writes as trivia, and a dropped `;` (`Space`);
 * - sources v12 never lexed as an ishikawa (`oracle.tokens` is undefined: the detector
 *   `/^\s*ishikawa(-beta)?\b/i` wants a word boundary after the keyword, and a commented copy
 *   of a short body can cut the header); the test bounds which.
 *
 * Nothing else is excluded. Empty-image tokens are compared too: `EOF` (`<<EOF>>`,
 * zero-width) and the clipped appended `NL`.
 */
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of ishikawaTokens(source)) {
    const name = JISON_NAMES[t.kind];
    if (name) out.push([name, t.text]);
  }
  return out;
}

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

describe('ishikawa lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('ishikawa');
    const items = await ishikawaGateCorpus();
    const diffs: string[] = [];
    const skipped: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    for (const item of items) {
      const v12 = await oracle.tokens(item.source);
      if (!v12) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (v12.some(([n]) => n === LEXICAL_ERROR)) diffs.push(`${item.id}: v12 threw`);
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('ishikawa-cases/')) cases++;
      }
      const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const near = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${near(expected)}\n  v13 ${near(actual)}`);
    }
    process.stdout.write(
      `ishikawa lexer parity: ${compared} of ${items.length} sources lexed by v12\n`
    );
    expect(diffs).toEqual([]);
    // Every e2e fixture (13 from v12, the nightly ones #580–#583 added, 17 baselines #585
    // added), harvested spec and syntax-page string and case reaches the lexer, the one case
    // v12 does not detect aside.
    expect(e2e).toBe(53);
    expect(specs).toBe(4);
    expect(cases).toBe(104);
    // The only sources v12 does not lex: `ishikawas` (no word boundary after the keyword) and
    // its variants, and commented copies of a body of two lines or fewer, where `%% cut` goes
    // through the middle of the header.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    const undetected = new Set(['ishikawa-cases/header-not-a-word']);
    expect(
      skipped.filter((id) => {
        const base = id.replace(VARIANT, '');
        if (undetected.has(base)) return false;
        const original = byId.get(base) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        return !(header && !/^\s*ishikawa(-beta)?\b/i.test(cut));
      })
    ).toEqual([]);
  }, 300_000);
});
