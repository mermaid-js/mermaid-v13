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
  BACKSLASH,
  COLON,
  COMMA,
  CR,
  codePointEnd,
  DASH,
  DIGIT_0,
  DOT,
  DQUOTE,
  firstHole,
  GT,
  isBlank,
  isDigit,
  isLetter,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  LPAREN,
  LT,
  newlineAt,
  PERCENT,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  SourceOffsets,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { KEYWORDS, STRATEGIES, T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token (WS). */
const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

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

/** Not in `[^\n\r]`. */
const isBreak = (c: number) => c === LF || c === CR;
/** `[A-Za-z0-9_()&]`: a name character, besides a `-` not before `>`. */
const isNameChar = (c: number) =>
  isLetter(c) || isDigit(c) || c === UNDERSCORE || c === LPAREN || c === RPAREN || c === AMP;

/**
 * Lex the wardley body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's wardley ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new WardleyLexer(src, from, view).run();
}

/** One lex. Offsets are into {@link text}; {@link emit} maps them to the source. */
class WardleyLexer {
  /** The text v12 lexed (tag quotes as `'`), plus the line break v12 appended. */
  private readonly text: string;
  /** Length of {@link text} without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private p: number;
  /** The kind of the last match of {@link scan}. */
  private kind = SKIP;

  // Memos that keep failed or repeated scans linear.
  /** The digit run `[digitsFrom, digitsTo)` last scanned. */
  private digitsFrom = -1;
  private digitsTo = -1;
  /** A `"` (`[0]`) or `'` (`[1]`) string starting before this fails (see {@link string}). */
  private readonly stringFails = [-1, -1];
  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;
  /** A YAML block whose body starts at or after this has no closing line. */
  private yamlFails = Infinity;
  /** A directive whose body starts at or after this has no closing `}%%`. */
  private directiveFails = Infinity;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    const text = view.mask ? tagQuotes(view) : view.text;
    this.text = text + '\n';
    this.len = text.length;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    // About one token per four characters of wardley text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
  }

  run(): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comment lines) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    let error = -1;
    while (this.p < n) {
      const p = this.p;
      const end = this.scan(p);
      if (end < 0) {
        // No rule matches: skip to the next offset where one does, as Chevrotain does.
        if (error < 0) error = p;
        this.p = codePointEnd(text, p);
        continue;
      }
      if (error >= 0) {
        this.emit(Kind.Error, error, p);
        error = -1;
      }
      if (this.kind !== SKIP) this.emit(this.kind, p, end);
      this.p = end;
    }
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The end of the rule that matches at `p` (its kind in {@link kind}), or -1. */
  private scan(p: number): number {
    const c = this.text.charCodeAt(p);
    let e = this.symbols(p, c);
    if (e < 0) e = this.words(p);
    if (e < 0 && isLetter(c)) e = this.name(p);
    if (e < 0 && isBlank(c)) e = this.match(SKIP, this.blanks(p));
    if (e < 0) e = this.accessibility(p);
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

  private match(kind: number, end: number): number {
    this.kind = kind;
    return end;
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
   * ACC_DESCR, ACC_TITLE and TITLE at `p` (WS took any blanks before them). TITLE is reached
   * only at `title` before a `\s` character (NAME_WITH_SPACES takes it otherwise): `title` and
   * a line tail after a blank, else `title` alone.
   */
  private accessibility(p: number): number {
    const { text } = this;
    if (text.startsWith('accDescr', p)) {
      const e = this.accDescr(p + 8);
      if (e >= 0) return this.match(T.AccDescr, e);
    }
    if (text.startsWith('accTitle', p)) {
      const r = this.blanks(p + 8);
      if (text.charCodeAt(r) === COLON) return this.match(T.AccTitle, this.lineTail(r + 1));
    }
    if (text.startsWith('title', p)) {
      const r = p + 5;
      return this.match(T.Title, isBlank(text.charCodeAt(r)) ? this.lineTail(r + 1) : r);
    }
    return -1;
  }

  /** After `accDescr`: `[\t ]*:` and a line tail, or `\s*{[^}]*}`. */
  private accDescr(r: number): number {
    const { text } = this;
    const colon = this.blanks(r);
    if (text.charCodeAt(colon) === COLON) return this.lineTail(colon + 1);
    let b = r;
    while (b < this.n && isSpace(text.charCodeAt(b))) b++;
    if (text.charCodeAt(b) !== LBRACE) return -1;
    const close = this.brace(b + 1);
    return close < 0 ? -1 : close + 1;
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

  /**
   * STRING: `"([^"\\]|\\.)*"` or the same with `'`. A scan fails at the end of the text or at
   * a `\` before a line end. Every quote of its kind it passed was escaped, so the scan from
   * one of them reads the same characters from there on and fails at the same place: a
   * start before a failure of its kind fails at once.
   */
  private string(p: number, quote: number): number {
    const k = quote === DQUOTE ? 0 : 1;
    if (p < (this.stringFails[k] ?? -1)) return -1;
    const { text, n } = this;
    let j = p + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === quote) return this.match(T.String, j + 1);
      if (c === BACKSLASH) {
        if (j + 1 >= n || isLineEnd(text.charCodeAt(j + 1))) break;
        j += 2;
      } else j++;
    }
    this.stringFails[k] = j;
    return -1;
  }

  /**
   * YAML: `---[\t ]*\r?\n(?:[\S\s]*?\r?\n)?---(?:\r?\n|(?!\S))`: a closing `---` that ends at a
   * line break, a blank or the end. The optional group is tried first, so the first closing line
   * after a line break in the body wins; only without one does a `---` at the body's start close
   * it (`---\n---\n…\n---` is one block to the last line).
   */
  private yaml(p: number): number {
    const { text, n } = this;
    if (!text.startsWith('---', p)) return -1;
    const b = this.blanks(p + 3);
    const nl = this.newline(b);
    if (nl === 0) return -1;
    const body = b + nl;
    if (body >= this.yamlFails) return -1;
    for (let k = body + 1; k < n; k++) {
      if (!isBreak(text.charCodeAt(k - 1)) || !text.startsWith('---', k)) continue;
      const e = this.closer(k + 3);
      if (e >= 0) return this.match(T.Yaml, e);
    }
    const e = text.startsWith('---', body) ? this.closer(body + 3) : -1;
    if (e >= 0) return this.match(T.Yaml, e);
    this.yamlFails = body;
    return -1;
  }

  /** DIRECTIVE: `%%{[\S\s]*?}%%(?:\r?\n|(?!\S))` (the `[\t ]*` before it is WS's). */
  private directive(p: number): number {
    const { text } = this;
    if (text.charCodeAt(p + 2) !== LBRACE) return -1;
    const body = p + 3;
    if (body >= this.directiveFails) return -1;
    for (let k = text.indexOf('}%%', body); k !== -1; k = text.indexOf('}%%', k + 1)) {
      const e = this.closer(k + 3);
      if (e >= 0) return this.match(Kind.Directive, e);
    }
    this.directiveFails = body;
    return -1;
  }

  /** `(?:\r?\n|(?!\S))` at `q`: its end, or -1. */
  private closer(q: number): number {
    const nl = this.newline(q);
    if (nl > 0) return q + nl;
    return q >= this.n || isSpace(this.text.charCodeAt(q)) ? q : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  /**
   * The length of the line break at `q` (`\r?\n` or a lone CR, which v12 read as LF), or 0. A
   * CR that ends the source is one break on its own, not a CRLF with the appended line break.
   */
  private newline(q: number): number {
    const nl = newlineAt(this.text, q);
    return nl === 2 && q + 1 === this.len ? 1 : nl;
  }

  /** The end of the run of `[\t ]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `[0-9]` from `q`, a run scanned once. */
  private digits(q: number): number {
    if (q >= this.digitsFrom && q < this.digitsTo) return this.digitsTo;
    let j = q;
    while (j < this.n && isDigit(this.text.charCodeAt(j))) j++;
    this.digitsFrom = q;
    this.digitsTo = j;
    return j;
  }

  /** The end of the run of `[^\n\r]` from `q`. */
  private lineEnd(q: number): number {
    let j = q;
    while (j < this.n && !isBreak(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `[^\n\r]*?(?=%%)|[^\n\r]*` from `q`: the first `%%` on the line, else the line end. */
  private lineTail(q: number): number {
    const { text, n } = this;
    let j = q;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (isBreak(c) || (c === PERCENT && text.charCodeAt(j + 1) === PERCENT)) break;
      j++;
    }
    return j;
  }

  /** The first `}` at or after `q`, or -1; one search serves every start before what it found. */
  private brace(q: number): number {
    const at = this.braceAt;
    if (at !== UNSET && q >= this.braceFrom && (at === -1 || q <= at)) return at;
    this.braceFrom = q;
    this.braceAt = this.text.indexOf('}', q);
    return this.braceAt;
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    return this.offsets ? this.offsets.source(i) : i;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
    }
  }

  /** Write the token `text[s, e)` with its source range. */
  private emit(kind: number, s: number, e: number): void {
    const a = this.source(s);
    const last = Math.min(e, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }
}

/** The view's text with the tag-attribute quotes v12 turned into `'` turned so too. */
function tagQuotes(view: SourceView): string {
  const { text, mask, runs } = view;
  if (!mask) return text;
  const at = runs ? new SourceOffsets(runs) : undefined;
  let out = '';
  let from = 0;
  for (let i = text.indexOf('"'); i !== -1; i = text.indexOf('"', i + 1)) {
    if (((mask[at ? at.source(i) : i] ?? 0) & QUOTE) === 0) continue;
    out += text.slice(from, i) + "'";
    from = i + 1;
  }
  return out + text.slice(from);
}
