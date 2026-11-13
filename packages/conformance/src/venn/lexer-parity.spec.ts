import { describe, expect, it } from 'vitest';
import { JISON_NAMES, vennTokens } from '@mermaid-js/diagram-venn';
import { v12TokenText } from '../v12-entities.ts';
import { LEXICAL_ERROR, loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { vennGateCorpus, VARIANTS } from './corpus.ts';

/**
 * Lexer-parity gate (parser-method §1, D212, #486): the v13 venn lexer emits the same
 * terminals, with the same images, as mermaid 12.2.0's `venn.jison` lexer on the text v12
 * lexed (`loadJisonLexerOracle('venn')`, whose `yy` builder plays the parser's part in indent
 * mode; `yy-emulation.spec.ts` checks it against the stream v12's parser pulls).
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF,
 *   and the two `BRACKET_LABEL` actions applied (`["…"]` its inside, `[…]` its inside trimmed);
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (v13 writes a one-character error token and lexes on, for recovery).
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, with every
 * indent removed (an indented `text` then meets the line-start rules with indent mode off),
 * and with a directive through the middle of every line after the header (pitfall 3's
 * mid-line cut). The cases file holds the line-separator cases (pitfall 2) too.
 *
 * Exclusions:
 * - v13 kinds with no jison name, left out of the v13 stream: the `text` right after an
 *   `INDENT_TEXT` (jison's action returns no token for it), comments (the `%%` lines v12
 *   removed, and the `%%` comments jison's rules skip, with the character a glued one eats)
 *   and directives, which v13 writes as trivia;
 * - the sources in {@link EXCLUDED}, with every variant of them;
 * - sources v12 never lexed as a venn (`oracle.tokens` is undefined: the detector
 *   `/^\s*venn-beta/` wants the `-beta` and is case-sensitive, and a commented copy of a short
 *   body can cut the header); the test bounds which.
 *
 * Empty-image tokens are not excluded: `EOF` (`<<EOF>>`, zero-width) and the clipped appended
 * `NEWLINE` are v13 tokens too, and a `["…"]` or blank `[…]` label reads `''`.
 */
const EXCLUDED: ReadonlyMap<string, string> = new Map([
  [
    // v12's directive regex also removed the line break after an unclosed `%%{x}` and the rest
    // of the text; the difference is in core's directive reading, shared by every type
    // (cynefin and pie exclude it too), not in a venn lexer rule.
    'venn-cases/unclosed-directive-',
    'core ends an unclosed directive at its line end (UNCLOSED_DIRECTIVE)',
  ],
]);

const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

function v13Tokens(source: string): JisonToken[] {
  const out: JisonToken[] = [];
  for (const t of vennTokens(source)) {
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

describe('venn lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('venn');
    const items = await vennGateCorpus();
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
        if (item.id.startsWith('venn-cases/')) cases++;
      }
      const expected = v12.map(([n, i]): JisonToken => [n, v12TokenText(i)]);
      const actual = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const near = (t: JisonToken[]) => show(t.slice(Math.max(0, at - 2), at + 3));
      diffs.push(`${item.id} @${at}\n  v12 ${near(expected)}\n  v13 ${near(actual)}`);
    }
    process.stdout.write(
      `venn lexer parity: ${compared} of ${items.length} sources lexed by v12\n`
    );
    // Every e2e fixture, harvested spec and syntax-page string and case reaches the lexer (the
    // three cases v12 does not detect and the two excluded ones aside; #488 added 27 recovery
    // cases, one of them without the header, and `union-entity-sort`; #491 15 layout fixtures; #501
    // 22 baselines).
    expect(e2e).toBe(80);
    expect(specs).toBe(25);
    expect(cases).toBe(222);
    expect(diffs).toEqual([]);
    // The excluded sources: the two unclosed-directive cases and their variants.
    expect(excluded.filter((id) => !VARIANT.test(id))).toHaveLength(2);
    // The only sources v12 does not lex: the three cases with no header, no `-beta` or an
    // upper-case header (and their variants), and commented copies of a body of two lines or
    // fewer, where `%% cut` goes through the middle of the `venn-beta` header.
    const byId = new Map(items.map((item) => [item.id, item.source]));
    const undetected = new Set([
      'venn-cases/header-no-suffix',
      'venn-cases/header-upper-case',
      'venn-cases/recovery-missing-header',
    ]);
    expect(
      skipped.filter((id) => {
        const base = id.replace(VARIANT, '');
        if (undetected.has(base)) return false;
        const original = byId.get(base) ?? '';
        const cut = byId.get(id) ?? '';
        const header = id.endsWith(' (commented)') && original.split('\n').length <= 2;
        return !(header && !/^\s*venn-beta/.test(cut));
      })
    ).toEqual([]);
    expect(skipped.length).toBeLessThan(40);
  }, 300_000);
});
