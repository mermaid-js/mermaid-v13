/**
 * Pie lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `pie.langium` and `common.langium`), in its order (parser-method §1, D213):
 *
 *   showData, pie, `:`, NUMBER_PIE, ACC_DESCR, ACC_TITLE, TITLE, STRING, NEWLINE,
 *   WHITESPACE (skipped), YAML, DIRECTIVE, SINGLE_LINE_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins (no longest match, no rule
 * here has a longer alternative); a regex backtracks inside a rule (`12.` is `1`, then an
 * error); `\s`/`\S` are JS's; `[^\n\r]` stops at LF and CR only. Where no rule matches it
 * writes one `Error` token over the characters up to the next offset where one does, as
 * Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12 turned
 * CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 * Entities need nothing: v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's number rule is quadratic on
 * a long run of digits and its string rule on escaped quotes; here a digit run is scanned once,
 * and a string, `accDescr {…}`, YAML or directive scan that failed is not repeated for a start
 * it covered.
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

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 8,
};

/**
 * Lex the pie body `src[from…]`. `view` comes from {@link sourceView} (default options: v12's
 * pie ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new PieLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class PieLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.keyword('showData', p, T.ShowData);
    if (e < 0) e = this.keyword('pie', p, T.Pie);
    if (e < 0 && c === COLON) e = this.match(T.Colon, p + 1);
    if (e < 0 && (c === DASH || isDigit(c))) e = this.number(p);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directiveOrComment(p);
    }
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * NUMBER_PIE: `-?[0-9]+\.[0-9]+(?!\.)` or `-?(0|[1-9][0-9]*)(?!\.)`, with the regex's
   * backtracking: a digit run before a `.` gives up its last digit (`1.23.` is `1.2`, `12.` is
   * `1`).
   */
  private number(p: number): number {
    const { text } = this;
    const s = text.charCodeAt(p) === DASH ? p + 1 : p;
    if (!isDigit(text.charCodeAt(s))) return -1;
    const d = this.digits(s);
    if (text.charCodeAt(d) === DOT && isDigit(text.charCodeAt(d + 1))) {
      const f = this.digits(d + 1);
      if (text.charCodeAt(f) !== DOT) return this.match(T.Number, f);
      if (f - (d + 1) >= 2) return this.match(T.Number, f - 1);
    }
    if (text.charCodeAt(s) === DIGIT_0) {
      return text.charCodeAt(s + 1) === DOT ? -1 : this.match(T.Number, s + 1);
    }
    if (text.charCodeAt(d) !== DOT) return this.match(T.Number, d);
    return d - s >= 2 ? this.match(T.Number, d - 1) : -1;
  }
}
