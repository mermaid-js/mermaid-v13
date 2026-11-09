import { describe, expect, it } from 'vitest';
import { blockTokens, JISON_NAMES } from '@mermaid-js/diagram-block';
import { decodeEntities } from '../flowchart/v12.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { blockGateCorpus, VARIANTS } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D212, #553): the v13 block lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `block.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('block')`).
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 *   `columns auto` sets the image to the number -1, compared as the string `-1`;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (v13 writes a one-character error token and lexes on, for recovery).
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and, in a short body, one through the middle of the text after the header), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, and with a
 * directive through the middle of every line after the header (pitfall 3's mid-line cut). The
 * cases file holds the line-separator cases (pitfall 2) too.
 *
 * Exclusions:
 * - v13 kinds with no jison name, left out of the v13 stream: the quotes (and quote and
 *   backtick pairs) around strings, `accDescr {` and its `}`, and `]>\s*(` opening a block
 *   arrow's directions (jison matches them and returns no token); comments and directives,
 *   which v13 writes as trivia. Skipped blanks are no token on either side;
 * - the sources in {@link EXCLUDED}, with every variant of them;
 * - sources v12 never lexed as a block (`oracle.tokens` is undefined): only
 *   `block-cases/header-upper-case` and its variants, as the detector `/^\s*block(-beta)?/` is
 *   case-sensitive (asserted). The commented variant cuts a short body after its header
 *   (`blockCommented`), so every other variant is compared.
 *
 * Empty-image tokens are not excluded: `EOF` (`<<EOF>>`, zero-width), and the empty `STR`,
 * `CLASSDEF_STYLEOPTS`, `STYLECLASS`, `STYLE_DEFINITION_DATA` and accessibility values a
 * `[^"]*`, `[^\n]*` or `[^}]*` rule matches before a line break or at the end, are v13 tokens
 * too. A stream that ends in any other state has no `EOF`: jison ends it with `$end` alone.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    // v12's directive regex also removed the line break after an unclosed `%%{x` and the rest
    // of the text; the difference is in core's directive reading, shared by every type
    // (cynefin, pie and venn exclude it too), not in a block lexer rule.
    'block-cases/unclosed-directive-',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
]);

const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of blockTokens(source)) {
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

const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');

describe('block lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('block');
    const items = await blockGateCorpus();
    const diffs: string[] = [];
    const skipped: string[] = [];
    const excluded: string[] = [];
    let compared = 0;
    let e2e = 0;
    let specs = 0;
    let cases = 0;
    for (const item of items) {
      if ([...EXCLUDED.keys()].some((prefix) => item.id.startsWith(prefix))) {
        excluded.push(item.id);
        continue;
      }
      const v12 = await oracle.tokens(item.source);
      if (!v12) {
        skipped.push(item.id);
        continue;
      }
      compared++;
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('block-cases/')) cases++;
      }
      const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(String(i))]);
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const near = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${near(expected)}\n  v13 ${near(actual)}`);
    }
    process.stdout.write(
      `block lexer parity: ${compared} of ${items.length} sources lexed by v12, ${skipped.length} skipped\n`
    );
    expect(diffs).toEqual([]);
    // The excluded sources: the unclosed-directive case and its variants.
    expect(excluded.filter((id) => !VARIANT.test(id))).toHaveLength(1);
    // Every e2e fixture, harvested spec and syntax-page string and case reaches the lexer (the
    // case with an upper-case header and the excluded one aside).
    expect(e2e).toBe(58);
    expect(specs).toBe(62);
    expect(cases).toBe(178);
    // The only sources v12 does not lex: the upper-case header and its variants (the detector
    // `/^\s*block(-beta)?/` is case-sensitive).
    expect(
      skipped.filter((id) => id.replace(VARIANT, '') !== 'block-cases/header-upper-case')
    ).toEqual([]);
    expect(skipped.length).toBeGreaterThan(0);
  }, 300_000);
});
