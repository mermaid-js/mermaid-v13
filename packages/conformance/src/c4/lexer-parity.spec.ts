import { describe, expect, it } from 'vitest';
import { decodeEntities } from '../flowchart/v12.ts';
import { loadJisonLexerOracle } from '../jison/oracle.ts';
import type { JisonToken } from '../jison/oracle.ts';
import { c4GateCorpus, VARIANTS } from './corpus.ts';
import { exclusion, v13Tokens } from './d452.ts';
import type { Exclusion } from './d452.ts';

/**
 * Lexer-parity gate (parser-method §1, #538): the v13 C4 lexer emits the same terminals, with
 * the same images, as v12's jison lexer (`c4Diagram.jison`) on the text v12 lexed.
 *
 * Normalisation, both sides:
 * - images are compared as v12's parser read them: entity placeholders decoded, CRLF as LF;
 * - v12 appended a `\n` before lexing; v13 lexes a sentinel line break there whose image is
 *   clipped to the source, so the oracle takes that `\n` off the token that matched it;
 * - after a lexical error jison stops, so both streams are cut at the first `LEXICAL_ERROR`
 *   (an unknown word, `;`, a blank or line break after a macro keyword, `title` with nothing
 *   after it, `$k=x`, a `#` that a `title` stops at).
 *
 * Every source is also lexed in each generated variant (`VARIANTS`): with comment lines added
 * (and one through the middle of a short body), with every line break a CR followed by a
 * removed comment or directive line, with CRLF line breaks, with tab indents, with U+2028 and
 * U+2029 in every line (pitfall 3), and with a directive through the middle of every line
 * after the header. The cases file adds the quirks the spec lists (unquoted arguments over `)`
 * and line breaks, a blank before a comma, no escapes, `%%` eating the line break, the
 * `.*direction` rules), rejections, line-separator, CR, entity and tag-quote cases.
 *
 * Exclusions (v13 kinds with no jison name, left out of the v13 stream):
 * - `(`, `)`, `,`, the quotes around an argument, `$`, `="` and the closing `"` of a named
 *   argument, `accDescr {` and its `}`: jison matches them and returns no token;
 * - comments (the `%%` lines v12 removed, and a mid-line `%%` jison skips with the line breaks
 *   after it), directives and skipped blanks, which v13 writes as trivia.
 *
 * Empty-image tokens are not excluded: `EOF`, `EOF_IN_STRUCT` and the empty `STR`, `STR_KEY`,
 * accessibility and `accDescr {` values jison matches on the empty text at the end are tokens
 * of their own (zero-width), as is the clipped appended `NEWLINE`. A stream that ends in the
 * arguments or a named argument's `=`/value has no final token: jison ends it with `$end`.
 *
 * D452's three lexing changes (#539) are the listed exclusions. A source is excluded when its
 * first differing token is one of them; the rest of its stream is not compared (it follows the
 * changed token), and the unit specs of `diagram-c4/src/parser/lexer.spec.ts` pin it:
 * - `unquoted`: v12's `STR` runs over a `)` or a line break, where v13's unquoted argument stops
 *   (`[^,)\n]+`), or a line break leaves the arguments (the parser reports the macro open);
 * - `comment`: v13 has a `NEWLINE` right after a `%%` comment, whose line breaks v12 ate;
 * - `title`: v12's `title` took a line break and the next line, v13's is a lone `title`.
 * The rest of D452 (`direction` lines and `$__proto__` as diagnostics, named arguments in the
 * alias or label slot) is parser work. A quoted label holding `direction LR` stays one
 * `direction_lr` token, so the parser reports it as D452's `direction` diagnostic.
 *
 * Sources v12 never lexed as C4 (`oracle.tokens` is undefined) are skipped; the test lists
 * them: five commented copies of a short body, where `%% cut` goes through the header.
 */
/**
 * The e2e fixtures under `e2e/diagrams/c4` (the 32 of 12.2.0's corpus, #538's 12, #539's 2 and
 * #542's 14 baselines).
 */
const E2E_FIXTURES = 61;

/** The sources each D452 exclusion covers as they are (not in a variant), in corpus order. */
const D452_EXCLUDED: Record<Exclusion, string[]> = {
  unquoted: [
    'c4-cases/paren-at-end',
    'c4-cases/unquoted-runs-over-close-paren',
    'c4-cases/unquoted-descr-runs-over-lines',
    'c4-cases/unquoted-at-end',
    'c4-cases/unquoted-keeps-leading-blank',
    'c4-cases/blank-after-quote-before-paren',
    'c4-cases/tab-after-comma',
    'c4-cases/no-escapes',
    'c4-cases/unclosed-quote-runs-to-end',
    'c4-cases/single-quotes',
    'c4-cases/quote-inside-unquoted',
    'c4-cases/dollar-in-quotes',
    'c4-cases/acc-in-arguments',
    'c4-cases/comment-in-unquoted',
  ],
  comment: [
    'e2e/nightly-check/comments.mmd',
    'c4-cases/comment-mid-line-eats-newline',
    'c4-cases/comment-mid-line-eats-newlines',
    'c4-cases/comment-at-end',
    'c4-cases/comment-bare-percent',
    'c4-cases/comment-after-brace',
    'c4-cases/ls-in-comment',
  ],
  title: [
    'e2e/nightly-check/parse-fixes.mmd',
    'c4-cases/title-line-break-blank',
    'c4-cases/title-alone',
    'c4-cases/title-alone-then-statement',
  ],
};
/** How many sources, variants included, each D452 exclusion covers: unquoted, comment, title. */
const D452_COUNTS = [386, 43, 23];

/** A C4 header at the start of a text, as v12's detector and lexer read it. */
const HEADER = /^\s*C4(?:Context|Container|Component|Dynamic|Deployment)\b/;

const VARIANT = new RegExp(` \\((?:${VARIANTS.map(([s]) => s).join('|')})\\)$`);

describe('c4 lexer parity with mermaid@12 (jison)', () => {
  it('emits the same tokens over the corpus, the cases and their variants', async () => {
    const oracle = await loadJisonLexerOracle('c4');
    const items = await c4GateCorpus();
    const diffs: { id: string; at: number; v12: JisonToken[]; v13: JisonToken[] }[] = [];
    const excluded: Record<Exclusion, string[]> = { unquoted: [], comment: [], title: [] };
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
      if (!VARIANT.test(item.id)) {
        if (item.id.startsWith('e2e')) e2e++;
        if (item.id.startsWith('v12-')) specs++;
        if (item.id.startsWith('c4-cases/')) cases++;
      }
      const expected = v12.map(([n, i]): JisonToken => [n, decodeEntities(i)]);
      const { tokens: actual, ranges } = v13Tokens(item.source);
      if (JSON.stringify(expected) === JSON.stringify(actual)) continue;
      let at = 0;
      while (JSON.stringify(expected[at]) === JSON.stringify(actual[at])) at++;
      const [from, to] = ranges[at] ?? [0, 0];
      const why = exclusion(expected, actual, at, item.source.slice(from, to));
      if (why) {
        excluded[why].push(item.id);
        continue;
      }
      diffs.push({
        id: item.id,
        at,
        v12: expected.slice(Math.max(0, at - 2), at + 3),
        v13: actual.slice(Math.max(0, at - 2), at + 3),
      });
    }
    const count = (k: Exclusion) => excluded[k].length;
    process.stdout.write(
      `lexer parity: ${compared} of ${items.length} sources lexed by v12 (${e2e} e2e, ${specs} specs, ${cases} cases); ` +
        `D452 exclusions: ${count('unquoted')} unquoted, ${count('comment')} comment, ${count('title')} title\n`
    );
    const show = (t: JisonToken[]) => t.map(([n, i]) => `${n}:${JSON.stringify(i)}`).join(' ');
    expect(
      diffs.map((d) => `${d.id} @${d.at}\n  v12 ${show(d.v12)}\n  v13 ${show(d.v13)}`)
    ).toEqual([]);
    // The D452 exclusions: the sources excluded as they are, and how many sources each
    // excludes with the variants (a variant can change how v12 reads an argument: a U+2029
    // after a comma makes the quoted argument after it unquoted to v12, `[ ]*"` failing).
    const plain = (k: Exclusion) => excluded[k].filter((id) => !VARIANT.test(id));
    expect({
      unquoted: plain('unquoted'),
      comment: plain('comment'),
      title: plain('title'),
    }).toEqual(D452_EXCLUDED);
    expect([count('unquoted'), count('comment'), count('title')]).toEqual(D452_COUNTS);
    // Every e2e fixture, every harvested spec and syntax-page string and every case reaches
    // the lexer.
    expect(e2e).toBe(E2E_FIXTURES);
    expect(specs).toBe(160);
    expect(cases).toBe(178);
    // The only sources v12 does not lex: the commented copies of these bodies of two lines or
    // fewer, where `%% cut` goes through the middle of the header, so v12 detects no C4.
    expect(skipped).toEqual(
      ['header-alone', 'header-newline', 'keyword-at-end', 'paren-at-end', 'title-alone'].map(
        (name) => `c4-cases/${name} (commented)`
      )
    );
    const byId = new Map(items.map((item) => [item.id, item.source]));
    for (const id of skipped) {
      const original = byId.get(id.replace(VARIANT, '')) ?? '';
      const cut = (byId.get(id) ?? '').replace(/%%[^\n]*\n/g, '');
      expect(original.split('\n').length, id).toBeLessThanOrEqual(2);
      expect(original, id).toMatch(HEADER);
      expect(cut, id).not.toMatch(HEADER);
    }
  }, 300_000);
});
