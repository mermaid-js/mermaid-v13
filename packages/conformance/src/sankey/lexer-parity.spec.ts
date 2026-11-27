import { describe, expect, it } from 'vitest';
import { JISON_NAMES, sankeyTokens } from '@mermaid-js/diagram-sankey/testing';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { loadOracle } from '../oracle.ts';
import { sankeyGateCorpus, VARIANTS } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, #494): the v13 sankey lexer emits the same terminals,
 * with the same images, as v12's jison lexer on the text v12 lexed (after its preprocessing
 * and sankey's own `prepareTextForParsing`, which the oracle's `lexedText` captures).
 *
 * Normalisation, both sides:
 * - v12's lexed text never ends in the `\n` v12 appended (`prepareTextForParsing` trimmed it),
 *   so the oracle clips nothing;
 * - the stall. On a character outside printable ASCII other than a line break (a tab, a
 *   control character, `é`, a line separator, an entity placeholder), `{TEXTDATA}*` and
 *   `ESCAPED_TEXT` match the empty string without consuming it, so jison returns empty
 *   `NON_ESCAPED_TEXT` / `ESCAPED_TEXT` tokens forever (the oracle stops after 1,000) and
 *   never throws. The v12 stream is cut at the first such empty token that is not the last
 *   token of the stream and ended with `LEXICAL_ERROR`; v13 writes one `Kind.Error` over the
 *   run of such characters, and its stream is cut there. v12 rejects every source that
 *   stalls (asserted below), so the cut drops no accepted input.
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with every line break doubled, and
 * with a directive through the middle of every line. The cases include U+2028 / U+2029 ones.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream): comments (the `%%`
 * lines v12 removed), directives and a dropped `;`, which v13 writes as trivia.
 *
 * Empty-image tokens are not excluded: `EOF` for `<<EOF>>` (zero-width, at the end of the
 * text outside quotes) and the one empty `ESCAPED_TEXT` jison returns when the text ends
 * inside quotes are v13 tokens of their own (`Eof`, a zero-width `EscapedText`).
 *
 * Sources v12 never lexed as a sankey (`oracle.tokens` is undefined: the detector
 * `/^\s*sankey(-beta)?/` is case-sensitive) are skipped; the test bounds which.
 */
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => escape(s)).join('|')})\\)$`);
const TEXT = new Set(['NON_ESCAPED_TEXT', 'ESCAPED_TEXT']);

/** Where v12's lexer stalled: the first empty text token before the last token, or -1. */
function stallAt(v12: JisonToken[]): number {
  return v12.findIndex(([name, image], j) => image === '' && TEXT.has(name) && j < v12.length - 1);
}

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of sankeyTokens(source)) {
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

describe('sankey lexer parity with mermaid@12 (jison)', () => {
  it("captures the text after sankey's prepareTextForParsing", async () => {
    const oracle = await loadJisonLexerOracle('sankey');
    // Front matter, comment lines and outer blanks gone, blank lines collapsed, no `\n` appended.
    expect(await oracle.lexedText('---\ntitle: T\n---\nsankey\n\n a,b,1 \n%% c\n\nb,c,2\n')).toBe(
      'sankey\n a,b,1 \nb,c,2'
    );
  });

  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('sankey');
    const v12 = await loadOracle();
    const items = await sankeyGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    const stalls: string[] = [];
    const notStalls: string[] = [];
    const acceptedStalls: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    let separators = 0;
    for (const item of items) {
      const tokens = await oracle.tokens(item.source);
      if (!tokens) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('sankey-cases/')) cases++;
        if (item.id.startsWith('sankey-cases/line-separator-')) separators++;
      }
      let expected = tokens;
      const stall = stallAt(tokens);
      if (stall >= 0) {
        stalls.push(item.id);
        // A stall: every token from there on is the same empty one, up to the oracle's cap.
        const [name] = tokens[stall] ?? [''];
        const tail = tokens.slice(stall);
        if (tail.length < 1000 || tail.some(([n, i]) => n !== name || i !== '')) {
          notStalls.push(item.id);
        }
        if ((await v12.parse(item.source)).accepted) acceptedStalls.push(item.id);
        expected = [...tokens.slice(0, stall), [LEXICAL_ERROR, '']];
      }
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
    process.stdout.write(
      `lexer parity: ${compared} of ${items.length} sources lexed by v12, ${stalls.length} stall\n`
    );
    // Every e2e fixture, every harvested spec and syntax-page string and every case (the
    // line-separator ones among them) reaches the lexer: 18 restored e2e fixtures and 9
    // baselines (#503), D690's, and #1368's label fixture.
    expect(e2e).toBe(29);
    expect(specs).toBe(14);
    expect(cases).toBe(130);
    expect(separators).toBe(9);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // The stall exclusion: each one runs to the oracle's cap on one empty token, and v12
    // rejects the source.
    expect(stalls.length).toBeGreaterThan(30);
    expect(notStalls).toEqual([]);
    expect(acceptedStalls).toEqual([]);
    // The only sources v12 does not lex: commented copies of a body of two lines or fewer,
    // where `%% cut` goes through the middle of the `sankey` header (v12 detects no sankey
    // there). Each original is lexed as written above.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    expect(
      skipped.filter((id) => {
        const original = byId.get(id.replace(VARIANT, '')) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        return !(header && !/^\s*sankey/.test(cut));
      })
    ).toEqual([]);
    expect(skipped.length).toBe(8);
  }, 180_000);
});
