/**
 * Wardley lexer: the token rules of v12's Chevrotain lexer (`@mermaid-js/parser@2.0.1`, built
 * from `wardley.langium` and `common.langium`), in its order, as dumped from the 2.0.1 runtime
 * (parser-method §1, D213):
 *
 *   `[ , ] @ / ( ) - { }`, WARDLEY_NUMBER, ARROW, LINK_PORT, LINK_ARROW, LINK_LABEL, STRATEGY,
 *   KW_WARDLEY … KW_DEACCELERATOR, NAME_WITH_SPACES, WS (skipped), ACC_DESCR, ACC_TITLE, TITLE,
 *   INT, STRING, ID, NEWLINE, WHITESPACE (skipped, never reached), YAML, DIRECTIVE,
 *   SINGLE_LINE_COMMENT (hidden).
 *
 * Chevrotain facts it reproduces: the first rule in order wins, with one exception: the `-`
 * keyword has ARROW, LINK_ARROW and YAML as its longer alternatives, so `->`, `-->`, `-.->` and
 * a `---` block win over it. Every other keyword and terminal has no boundary and no longer
 * alternative (D423): `notebook` is `note` then the name `book`, `buyer` is `buy` then `er`.
 * NAME_WITH_SPACES comes before WS, the title and accessibility rules, INT and ID, so it takes
 * every token that starts with a letter, except at `title` before a `\s` character and at
 * `accTitle` or `accDescr` (its lookahead); WS takes every blank run before a token, so the
 * `[\t ]*` the common rules start with never matches. A regex backtracks inside a rule (`12.`
 * is INT `1`, then ID `2`, then an error); `\w`, `\s` and `\S` are JS's (ASCII `\w`, so `über`
 * is an error); `[^\n\r]` stops at LF and CR only. Where no rule matches it writes one `Error`
 * token over the characters up to the next offset where one does, as Chevrotain skips them.
 *
 * Like radar's lexer it lexes the text v12 lexed (pitfall 1): the source view
 * ({@link sourceView}) cuts the comment lines, directives and dropped `;` v12 removed, and marks
 * the tag quotes it turned into `'`; every token maps back to its range in the source, which is
 * never rewritten, and each removed span is a trivia token in source order. v12 turned CRLF and
 * CR into LF; here a CRLF is one line break and a lone CR is one, as LF would be.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5): v12's ACC_DESCR is quadratic on
 * lines of unclosed `accDescr {` (each rescans to the end for a `}`), and WARDLEY_NUMBER rescans
 * a zero run from every zero (INT takes one `0` at a time); here a digit run is scanned once,
 * and a string, `}`, YAML or directive scan that failed is not repeated for a start it covered.
 */
// cspell:words accdescr acctitle über
import {
  AMP,
  APOSTROPHE,
  AT,
  COMMA,
  DASH,
  DIGIT_0,
  DOT,
  DQUOTE,
  GT,
  isBlank,
  isDigit,
  isLetter,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LPAREN,
  LT,
  PERCENT,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import { isBreak, RuleLexer, SKIP } from '@mermaid-js/shared/parser/rule';
import type { RuleLexerOptions } from '@mermaid-js/shared/parser/rule';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { KEYWORDS, STRATEGIES, T } from './tokens.ts';

const HEADER = 'wardley-beta';
const PLUS = 0x2b;

/** The one-character keywords but `-`, by character. */
const PUNCTUATION: ReadonlyMap<number, number> = new Map([
  [LBRACKET, T.LBracket],
  [COMMA, T.Comma],
  [RBRACKET, T.RBracket],
  [AT, T.At],
  [SLASH, T.Slash],
  [LPAREN, T.LParen],
  [RPAREN, T.RParen],
  [LBRACE, T.LBrace],
  [RBRACE, T.RBrace],
]);

/** `[A-Za-z0-9_()&]`: a name character, besides a `-` not before `>`. */
const isNameChar = (c: number) =>
  isLetter(c) || isDigit(c) || c === UNDERSCORE || c === LPAREN || c === RPAREN || c === AMP;

/** The shared terminals' kinds, and about how many characters one token takes. */
const OPTIONS: RuleLexerOptions = {
  accDescr: T.AccDescr,
  accTitle: T.AccTitle,
  title: T.Title,
  string: T.String,
  yaml: T.Yaml,
  charsPerToken: 4,
};

/**
 * Lex the wardley body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's wardley ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new WardleyLexer(src, from, view, OPTIONS).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class WardleyLexer extends RuleLexer {
  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  protected scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.symbols(p, c);
    if (e < 0) e = this.words(p);
    if (e < 0 && isLetter(c)) e = this.name(p);
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0) e = this.accessibilityAt(p);
    if (e < 0) e = this.common(p, c);
    return e;
  }

  /**
   * The rules before the keywords, all of which start with a symbol or a digit: punctuation,
   * `-` (and its longer alternatives), WARDLEY_NUMBER, LINK_PORT, LINK_ARROW, LINK_LABEL.
   */
  private symbols(p: number, c: number): number {
    const punctuation = PUNCTUATION.get(c);
    if (punctuation !== undefined) return this.match(punctuation, p + 1);
    if (c === DASH) return this.dash(p);
    if (isDigit(c)) return this.decimal(p);
    if (c === PLUS) return this.plus(p);
    if (c === GT) return this.match(T.LinkArrow, p + 1);
    // LINK_LABEL: `;[^\n\r]+` (the appended line break ends every line).
    if (c === SEMI && !isBreak(this.text.charCodeAt(p + 1))) {
      return this.match(T.LinkLabel, this.lineEnd(p + 1));
    }
    return -1;
  }

  /** `common`'s rules after TITLE: INT, STRING, ID, NEWLINE, DIRECTIVE, SINGLE_LINE_COMMENT. */
  private common(p: number, c: number): number {
    let e = -1;
    if (isDigit(c)) e = this.int(p);
    if (e < 0 && (c === DQUOTE || c === APOSTROPHE)) e = this.string(p, c);
    if (e < 0 && isWord(c)) e = this.match(T.Id, this.id(p));
    if (e < 0 && isBreak(c)) e = this.match(Kind.Newline, p + this.newline(p));
    if (e < 0 && c === PERCENT && this.text.charCodeAt(p + 1) === PERCENT) {
      e = this.directive(p);
      if (e < 0) e = this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    return e;
  }

  // --- Rules --------------------------------------------------------------------------------

  /**
   * The `-` keyword and its longer alternatives, the first of which that matches wins: ARROW
   * (`->`), LINK_ARROW (`-->`, `-.->`), YAML.
   */
  private dash(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p + 1);
    if (c === GT) return this.match(T.Arrow, p + 2);
    if (text.startsWith('->', p + 1)) return this.match(T.LinkArrow, p + 3);
    if (text.startsWith('.->', p + 1)) return this.match(T.LinkArrow, p + 4);
    const e = this.yaml(p);
    return e >= 0 ? e : this.match(T.Dash, p + 1);
  }

  /** WARDLEY_NUMBER: `[0-9]+\.[0-9]+`. */
  private decimal(p: number): number {
    const d = this.digits(p);
    if (this.text.charCodeAt(d) !== DOT || !isDigit(this.text.charCodeAt(d + 1))) return -1;
    return this.match(T.Decimal, this.digits(d + 1));
  }

  /**
   * LINK_PORT (`+<>`, `+>`, `+<`), then LINK_ARROW's `+'[^']*'` with `<>`, `<` or `>`. The
   * `[^']*` stops at the first `'` (it crosses line breaks); the scans of two starts never
   * overlap, as each ends at the first `'` after its own.
   */
  private plus(p: number): number {
    const { text } = this;
    const c = text.charCodeAt(p + 1);
    if (c === LT) return this.match(T.LinkPort, text.charCodeAt(p + 2) === GT ? p + 3 : p + 2);
    if (c === GT) return this.match(T.LinkPort, p + 2);
    if (c !== APOSTROPHE) return -1;
    const q = text.indexOf("'", p + 2);
    if (q < 0) return -1;
    const after = text.charCodeAt(q + 1);
    if (after === LT) return this.match(T.LinkArrow, text.charCodeAt(q + 2) === GT ? q + 3 : q + 2);
    return after === GT ? this.match(T.LinkArrow, q + 2) : -1;
  }

  /** STRATEGY, then the keywords: the first word that starts the text, with no boundary. */
  private words(p: number): number {
    const { text } = this;
    for (const word of STRATEGIES) {
      if (text.startsWith(word, p)) return this.match(T.Strategy, p + word.length);
    }
    if (text.startsWith(HEADER, p)) return this.match(T.WardleyBeta, p + HEADER.length);
    for (const [word, kind] of KEYWORDS) {
      if (text.startsWith(word, p)) return this.match(kind, p + word.length);
    }
    return -1;
  }

  /**
   * NAME_WITH_SPACES from a letter at `p`: `(?!title\s|accTitle|accDescr)[A-Za-z]`, then name
   * characters (`[A-Za-z0-9_()&]` or `-(?!>)`), then words of `[ \t]+[A-Za-z(]` and name
   * characters. A blank run not followed by a word start is left to WS.
   */
  private name(p: number): number {
    const { text } = this;
    if (text.startsWith('accTitle', p) || text.startsWith('accDescr', p)) return -1;
    if (text.startsWith('title', p) && isSpace(text.charCodeAt(p + 5))) return -1;
    let end = this.nameChars(p + 1);
    for (;;) {
      const b = this.blanks(end);
      const c = text.charCodeAt(b);
      if (b === end || !(isLetter(c) || c === LPAREN)) break;
      end = this.nameChars(b + 1);
    }
    return this.match(T.Name, end);
  }

  /** The end of the run of name characters from `q`. */
  private nameChars(q: number): number {
    const { text, n } = this;
    let j = q;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (isNameChar(c) || (c === DASH && text.charCodeAt(j + 1) !== GT)) j++;
      else break;
    }
    return j;
  }

  /**
   * INT: `0|[1-9][0-9]*(?!\.)`, with the regex's backtracking: a digit run before a `.` gives
   * up its last digit (`12.` is `1`); a lone digit before a `.` fails; the `(?!\.)` is not on
   * the `0` (`0.` is `0`, `01` is `0` then `1`).
   */
  private int(p: number): number {
    const { text } = this;
    if (text.charCodeAt(p) === DIGIT_0) return this.match(T.Int, p + 1);
    const d = this.digits(p);
    if (text.charCodeAt(d) !== DOT) return this.match(T.Int, d);
    return d - p >= 2 ? this.match(T.Int, d - 1) : -1;
  }

  /** ID: `[\w]([-\w]*\w)?` from `p` (a `\w`): the `[-\w]` run without its trailing dashes. */
  private id(p: number): number {
    const { text, n } = this;
    let j = p + 1;
    let end = j;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (isWord(c)) end = ++j;
      else if (c === DASH) j++;
      else break;
    }
    return end;
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0. A
   * CR that ends the source is one break on its own, not a CRLF with the appended line break.
   */
  protected override newline(q: number): number {
    return this.newlineInSource(q);
  }
}
