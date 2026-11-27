import { describe, expect, it } from 'vitest';
import { JISON_NAMES, kanbanTokens } from '@mermaid-js/diagram-kanban';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { kanbanGateCorpus, VARIANTS } from './corpus.ts';
import { accProblem, accRanges, asPlaceholders, withPlaceholders } from './acc-divergence.ts';

/**
 * Lexer-parity gate (parser-method §1, #451): the v13 kanban lexer emits the same terminals,
 * with the same images, as v12's jison lexer on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (a `{` or `}` outside a shape, an `@` that starts no `@{`, a `^` in shape data, a lone
 *   backtick or quote in a markdown string, a line separator right after `:::`).
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, with each
 * one-line `@{…}` written over several lines, and with a directive through the middle of every
 * item line (pitfall 3's mid-line cut: `commented` cuts mid-line only in bodies of two lines or
 * fewer, which v12 does not detect). v12 lexes every mid-line variant; it accepts 110 of the
 * 114 it accepts unchanged. The cases file adds line-separator, CR, mid-line-directive and
 * shape-data cases.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - `:::`, `::icon(`, the `)` closing an icon, the quote (or quote and backtick) pairs around
 *   a shape's string, the line break after a bare `:::` and the `}` closing shape data: jison
 *   matches them and returns no token;
 * - comments (the `%%` lines v12 removed) and directives, which v13 writes as trivia.
 *
 * Empty-image tokens are not excluded. v13 writes them as tokens of their own kinds: `Eof`
 * for `<<EOF>>` and the clipped appended `NL` (zero-width), and `ShapeDataStart` for `@{`,
 * whose image jison's action cleared (its text is empty, its range covers `@{`). A stream that
 * ends in a shape, string, icon or shape data has no `EOF`: jison ends it with `$end` alone.
 * In a quoted run of shape data jison's action turns `\n\s*` into `<br/>`, and `kanbanTokens`
 * reads the run the same way; a run left open at the end took the appended `\n` too, so the
 * oracle has nothing to clip and the v13 text ends in `<br/>` as well.
 *
 * One divergence (D742, `acc-divergence.ts`): v13's acc statements, which v12 lexed as items.
 * v12 lexes the source with each of them replaced by a placeholder item, and v13's acc token
 * counts as that item's `NODE_ID`, so the whole stream is still compared; on the source as
 * written v12 must have read an item where v13 reads the first of them.
 *
 * Sources v12 never lexed as a kanban (`oracle.tokens` is undefined: the detector
 * `/^\s*kanban/` is case-sensitive) are skipped; the test bounds which.
 */
const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of kanbanTokens(source)) {
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

describe('kanban lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('kanban');
    const items = await kanbanGateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const skipped: string[] = [];
    const accDiffs: string[] = [];
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
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('kanban-cases/')) cases++;
      }
      const read = (t: JisonToken[]) => t.map(([n, i]): JisonToken => [n, v12TokenText(i)]);
      const ours = v13Tokens(item.source);
      const ranges = accRanges(item.source);
      let expected = read(v12);
      if (ranges.length > 0) {
        const problem = accProblem(expected, ours);
        if (problem) accDiffs.push(`${item.id}: ${problem}`);
        expected = read((await oracle.tokens(withPlaceholders(item.source, ranges))) ?? []);
      }
      const actual = asPlaceholders(ours);
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
    // Every e2e fixture, every harvested spec and syntax-page string and every case reaches
    // the lexer: 30 restored e2e fixtures and 23 baselines (#459), #837's attribute quotes,
    // D647's ticket-row pair, and D742's acc statements.
    expect(e2e).toBe(58);
    expect(specs).toBe(32);
    expect(cases).toBe(136);
    expect(accDiffs).toEqual([]);
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // The only sources v12 does not lex: commented copies of a body of two lines or fewer,
    // where `%% cut` goes through the middle of the `kanban` header (v12 detects no kanban
    // there). Each original is lexed as written above.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    expect(
      skipped.filter((id) => {
        const original = byId.get(id.replace(VARIANT, '')) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        return !(header && !/^\s*kanban/.test(cut));
      })
    ).toEqual([]);
    expect(skipped.length).toBeLessThan(12);
  }, 180_000);
});
