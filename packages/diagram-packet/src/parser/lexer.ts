/**
 * Packet lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `packet.langium` and `common.langium`), in its order (parser-method §1, D213):
 *
 *   packet-beta, packet, `-` (longer alternative YAML), `+`, `:`, ACC_DESCR, ACC_TITLE, TITLE,
 *   INT, STRING, NEWLINE, WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that a longer match of a
 * rule's longer alternative replaces it (`---` … `---` is YAML, not three `-`); a regex
 * backtracks inside a rule (`10.` is `1`, then `0`, then an error); `packet` must be followed by
 * `%%`, a blank or the end, `packet-beta` by nothing in particular (`packet-beta0` is the
 * keyword and `0`); `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR only. Where no rule
 * matches it writes one `Error` token over the characters up to the next offset where one does,
 * as Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12 turned
 * CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 * Entities need nothing: v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's ACC_DESCR rule is quadratic
 * on a run of unclosed `accDescr {` and its string rule on escaped quotes; here a string,
 * `accDescr {…}`, YAML or directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle
import {
  APOSTROPHE,
  COLON,
  DASH,
  DIGIT_0,
  DOT,
  DQUOTE,
  isBlank,
  isDigit,
  Kind,
  newlineAt,
  PERCENT,
} from '@mermaid-js/core/parser-kit';
import { isBreak, RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

const PLUS = 0x2b;

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 6,
};

/**
 * Lex the packet body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's packet ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new PacketLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class PacketLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p);
    let e = text.startsWith('packet-beta', p) ? this.match(T.PacketBeta, p + 11) : -1;
    if (e < 0) e = this.keyword('packet', p, T.Packet);
    // `-`, unless its longer alternative YAML matches.
    if (e < 0 && c === DASH) {
      e = this.yaml(p);
      if (e < 0) e = this.match(T.Dash, p + 1);
    }
    if (e < 0 && c === PLUS) e = this.match(T.Plus, p + 1);
    if (e < 0 && c === COLON) e = this.match(T.Colon, p + 1);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && isDigit(c)) e = this.int(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * INT: `0|[1-9][0-9]*(?!\.)`. `0` binds without the lookahead (`01` is `0`, `1`); a digit run
   * before a `.` gives up its last digit (`10.` is `1`, then `0`), and a single digit before it
   * fails.
   */
  private int(p: number): number {
    const { text } = this;
    if (text.charCodeAt(p) === DIGIT_0) return this.match(T.Int, p + 1);
    let d = p + 1;
    while (d < this.n && isDigit(text.charCodeAt(d))) d++;
    if (text.charCodeAt(d) !== DOT) return this.match(T.Int, d);
    return d - p >= 2 ? this.match(T.Int, d - 1) : -1;
  }
}
