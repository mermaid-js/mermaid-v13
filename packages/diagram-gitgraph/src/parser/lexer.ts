/**
 * gitGraph lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `gitGraph.langium`, `common.langium` and `reference.langium`), in its order
 * (parser-method §1, D213, D262):
 *
 *   cherry-pick, gitGraph:, HIGHLIGHT, gitGraph, checkout, REVERSE, parent:, commit, NORMAL,
 *   branch, order:, switch, type:, merge, msg:, tag:, id:, LR, TB, BT, `:`, ACC_DESCR,
 *   ACC_TITLE, TITLE, INT, STRING, NEWLINE, WHITESPACE (skipped), YAML, DIRECTIVE,
 *   SINGLE_LINE_COMMENT (hidden), REFERENCE.
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that a word keyword
 * (not the `…:` ones) yields to REFERENCE, its longer alternative, where REFERENCE matches more
 * (`commits`, `cherry-pick03`); TITLE has none, so `titled` is TITLE `title` and REFERENCE `d`
 * (D269); `gitGraph` needs a blank, `%%` or the end after it; a regex backtracks inside a rule
 * (`10.5` is INT `1`, INT `0`, then an error); `\s`/`\S` are JS's and `\w` is ASCII;
 * `[^\n\r]` stops at LF and CR only. Where no rule matches it writes one `Error` token over the
 * characters up to the next offset where one does, as Chevrotain skips them.
 *
 * Like the other v13 lexers it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and
 * marks the tag quotes it turned into `'`; every token maps back to its range in the source,
 * which is never rewritten, and each removed span is a trivia token in source order. v12 turned
 * CRLF and CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 * Entities need nothing: v12's placeholders lex as the `#…;` they replace.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): a digit run is scanned once, and a
 * string, `accDescr {…}`, YAML or directive scan that failed is not repeated for a start it
 * covered. A REFERENCE scan reads one run of name characters; what it leaves of the run is `.`
 * and `/`, which no rule starts with.
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
  isBreak,
  isDigit,
  isLetter,
  isWord,
  Kind,
  newlineAt,
  PERCENT,
  RuleLexer,
  SKIP,
  SLASH,
} from '@mermaid-js/core/parser-kit';
import type { RuleLexerOptions, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

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
 * Lex the gitGraph body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's gitGraph ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new GitGraphLexer(src, from, view, OPTIONS).run();
}

/**
 * The keyword rules in Chevrotain's order: word, kind, and whether REFERENCE is its longer
 * alternative (every word keyword; not the `…:` ones).
 */
const KEYWORDS: readonly (readonly [word: string, kind: number, longer: boolean])[] = [
  ['cherry-pick', T.CherryPick, true],
  ['gitGraph:', T.GitGraphColon, false],
  ['HIGHLIGHT', T.Highlight, true],
  ['gitGraph', T.GitGraph, true],
  ['checkout', T.Checkout, true],
  ['REVERSE', T.Reverse, true],
  ['parent:', T.Parent, false],
  ['commit', T.Commit, true],
  ['NORMAL', T.Normal, true],
  ['branch', T.Branch, true],
  ['order:', T.Order, false],
  ['switch', T.Switch, true],
  ['type:', T.Type, false],
  ['merge', T.Merge, true],
  ['msg:', T.Msg, false],
  ['tag:', T.Tag, false],
  ['id:', T.Id, false],
  ['LR', T.LR, true],
  ['TB', T.TB, true],
  ['BT', T.BT, true],
];

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class GitGraphLexer extends RuleLexer {

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = isLetter(c) ? this.keywords(p, c) : -1;
    if (e < 0 && c === COLON) e = this.match(T.Colon, p + 1);
    if (e < 0) e = this.accessibility(p);
    if (e < 0 && isDigit(c)) e = this.int(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + newlineAt(this.text, p));
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0 && c === DASH) e = this.yaml(p);
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (e < 0 && isWord(c)) e = this.match(T.Reference, this.reference(p));
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * The keyword rules, in order: the first whose word is at `p` (and, for `gitGraph`, followed
   * by `(?:(?=%%)|(?!\S))`), unless it is a word keyword and REFERENCE matches more there.
   */
  private keywords(p: number, c: number): number {
    const { text } = this;
    for (const [word, kind, longer] of KEYWORDS) {
      if (word.charCodeAt(0) !== c || !text.startsWith(word, p)) continue;
      const q = p + word.length;
      if (kind === T.GitGraph && !this.boundary(q)) continue;
      if (longer) {
        const r = this.reference(p);
        if (r > q) return this.match(T.Reference, r);
      }
      return this.match(kind, q);
    }
    return -1;
  }

  /**
   * INT: `0|[1-9][0-9]*(?!\.)`, with the regex's backtracking: a digit run before a `.` gives
   * up its last digit (`12.` is `1`; `1.` is no INT).
   */
  private int(p: number): number {
    if (this.text.charCodeAt(p) === DIGIT_0) return this.match(T.Int, p + 1);
    const d = this.digits(p);
    if (this.text.charCodeAt(d) !== DOT) return this.match(T.Int, d);
    return d - p >= 2 ? this.match(T.Int, d - 1) : -1;
  }

  /** REFERENCE from a `\w` at `p`: `\w([-./\w]*[-\w])?`, the run to its last `[-\w]`. */
  private reference(p: number): number {
    const { text, n } = this;
    let last = p + 1;
    for (let j = p + 1; j < n; j++) {
      const c = text.charCodeAt(j);
      if (isWord(c) || c === DASH) last = j + 1;
      else if (c !== DOT && c !== SLASH) break;
    }
    return last;
  }
}
