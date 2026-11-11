/**
 * Usecase lexer: the token rules of v12's Chevrotain lexer
 * (`mermaid@12.2.0:…/diagrams/usecase/parser/usecase.tokens.ts`), in its order and with its
 * three modes (parser-method §1, D324):
 *
 * - **default:** `HWS` (skipped), `MARKDOWN_STRING`, `UNCLOSED_MARKDOWN_STRING`, `COMMENT`,
 *   `NEWLINE`, `ACC_DESCR_BLOCK`, `ACC_TITLE_LINE`, `ACC_DESCR_LINE`, `JSON_DECLARATION_START`
 *   (to `jsonBody`), the keywords, the operators (`<<` to `stereotype`), `HASH_COLOR`,
 *   `PLAIN_STRING`, `CSS_IDENTIFIER`, `IDENTIFIER`, `NUMBER`, `CSS_ESCAPED_COMMA`, `DASH`, `DOT`,
 *   `PERCENT`, `CSS_PUNCTUATION`, `LABEL_PUNCTUATION`, `LABEL_SYMBOL`;
 * - **jsonBody:** `JSON_OBJECT_LITERAL`, `UNCLOSED_JSON_OBJECT_LITERAL` (both back to default);
 * - **stereotype:** `STEREOTYPE_END` (back), `STEREOTYPE_TEXT`, `UNCLOSED_STEREOTYPE_TEXT` (back).
 *
 * Chevrotain facts it reproduces: the first rule in order wins, except that a keyword gives way
 * to `IDENTIFIER` when the `\w` run there is longer (`actors`, `TBD`; `actor-x` stays `ACTOR`,
 * so a word that starts with a keyword is never a `CSS_IDENTIFIER`), and `IDENTIFIER` gives way
 * to `NUMBER` when that is longer (`1.5px`; `1mg` stays an id). Where no rule matches (an
 * unclosed `"` or `'`, a line break in stereotype mode) it writes one `Error` token over the
 * characters up to the next offset where one does, as Chevrotain skips them, and goes on.
 *
 * It lexes the text v12 lexed (pitfall 1), built once per lex: the source view's text
 * ({@link sourceView}: comment lines, directives and dropped `;` cut out, tag quotes marked)
 * from the first non-blank on (v12 trimmed it), with CRLF and CR as LF, every `#name;` /
 * `#123;` as `encodeEntities`'s placeholder (`ﬂ°name¶ß`, `ﬂ°°123¶ß`, which v12's lexer splits
 * into `LABEL_SYMBOL`, a word and `LABEL_SYMBOL`), and the `\n` v12 appended. Each of its
 * characters maps back to a source range, so every token range is a source range; a
 * placeholder's characters map to the `#` and the `;` they stand for. Each removed span is a
 * trivia token in source order.
 *
 * Every scan is linear in the text (R-PARSE-7, pitfall 5). v12 is quadratic on lines of `<<`
 * without `>>` (each searches the rest of the input for `>>`) and on lines of unclosed
 * `accDescr {` (each searches for `}`); here a stereotype scan stops at its line end, and one
 * `}` search serves every start before what it found. A failed string scan is not repeated
 * for a start it covered.
 */
// cspell:words accdescr acctitle markerless
import {
  AMP,
  APOSTROPHE,
  AT,
  BACKSLASH,
  BACKTICK,
  CARET,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  firstHole,
  GT,
  HASH,
  isBlank,
  isDigit,
  isHex,
  isLetter,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  localOffset,
  LOWER_A,
  LOWER_O,
  LOWER_X,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  QUESTION,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SLASH,
  SourceOffsets,
  SPACE,
  STAR,
  TAB,
  TILDE,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import { dropAt, tagQuotes } from '@mermaid-js/shared/parser/drop';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { ANY_CASE, KEYWORDS, T } from './tokens.ts';

/** `kind` of a rule that matched and writes no token (`HWS`). */
const SKIP = -1;
/** A memo not set yet. */
const UNSET = -2;

const BANG = 0x21;
const DOLLAR = 0x24;
const PLUS = 0x2b;
const LOWER_J = 0x6a;
/** The bit that makes an ASCII letter lower case. */
const CASE_BIT = 0x20;

const MODE_DEFAULT = 0;
const MODE_JSON = 1;
const MODE_STEREOTYPE = 2;

/** One character token per character, in the default mode's order after the operators. */
const SINGLE: ReadonlyMap<number, number> = new Map([
  [LBRACE, T.LBrace],
  [RBRACE, T.RBrace],
  [LBRACKET, T.LBracket],
  [RBRACKET, T.RBracket],
  [LPAREN, T.LParen],
  [RPAREN, T.RParen],
  [COMMA, T.Comma],
  [COLON, T.Colon],
]);

/** `[!#$&*+/=?^_|~]`: `CSS_PUNCTUATION` (its `_` is always an `IDENTIFIER` first). */
const isCssPunctuation = (c: number) =>
  c === BANG ||
  c === HASH ||
  c === DOLLAR ||
  c === AMP ||
  c === STAR ||
  c === PLUS ||
  c === SLASH ||
  c === EQUALS ||
  c === QUESTION ||
  c === CARET ||
  c === UNDERSCORE ||
  c === PIPE ||
  c === TILDE;
/** `;`, `<`, `>`, a backslash or a backtick: `LABEL_PUNCTUATION`. */
const isLabelPunctuation = (c: number) =>
  c === SEMI || c === LT || c === GT || c === BACKSLASH || c === BACKTICK;
/** `[^\t\n\r !-~]`: a `LABEL_SYMBOL` character. */
const isSymbol = (c: number) => !(c === TAB || c === LF || c === CR || (c >= SPACE && c <= TILDE));

/**
 * The text v12's lexer received, and where each of its characters is in the source.
 *
 * {@link start} and {@link end} share one forward cursor over the source view's runs when the
 * text needed no rewrite: a call costs O(runs passed since the previous call). Call them in
 * non-decreasing `k` (as the lexer and `usecaseTokens` do); jumping back and forth over a text
 * cut by many comment lines makes the total cost quadratic.
 */
export interface LexText {
  /** v12's text: trimmed at its start, CRs as LF, entity placeholders, `\n` appended. */
  readonly text: string;
  /** Source offset where `text[k]` starts. */
  start(k: number): number;
  /** Source offset where `text[k]` ends. */
  end(k: number): number;
}

/** A lex: the token stream and, per token, its offsets into {@link LexText.text}. */
export interface Lexed {
  readonly tokens: TokenStream;
  readonly input: LexText;
  /** `[from, to)` of token `j` in {@link LexText.text}; -1 for the removed spans (trivia). */
  readonly at: Int32Array;
  readonly to: Int32Array;
}

/**
 * Lex the usecase body `src[from…]`. `view` comes from {@link sourceView} (default options:
 * v12's usecase ran every shared rewrite).
 */
export function lex(src: string, from: number, view: SourceView): Lexed {
  return new UsecaseLexer(src, from, lexText(src, from, view), view).run();
}

/**
 * The text v12's usecase lexer received for `src[from…]`, built from `view` as `cleanupText`,
 * the trim after comment removal, `encodeEntities` and `Diagram.fromText` did it.
 */
export function lexText(src: string, from: number, view: SourceView): LexText {
  const v = view.text;
  let p = localOffset(view, from);
  while (p < v.length && isSpace(v.charCodeAt(p))) p++;
  const offsets = view.runs ? new SourceOffsets(view.runs, p) : undefined;
  const source = (i: number) => (offsets ? offsets.source(i) : i);
  const { mask } = view;
  // Nothing to rewrite: the view's text is v12's (one character per source character).
  if (!mask && !v.includes('\r', p) && !v.includes('#', p)) {
    const text = v.slice(p) + '\n';
    const last = text.length - 1;
    const at = (k: number) => (k >= last ? src.length : source(p + k));
    return { text, start: at, end: (k) => (k >= last ? src.length : at(k) + 1) };
  }
  // Unchanged stretches are copied as slices; the run table maps each part of the text back:
  // a copied run 1:1 through the view's offsets, a rewritten one to a fixed source span.
  const parts: string[] = [];
  const runText: number[] = [];
  const runFrom: number[] = [];
  /** A rewritten run's source end; -1 for a copied run (`runFrom` is then a view offset). */
  const runTo: number[] = [];
  let length = 0;
  let copyFrom = p;
  const copy = (to: number) => {
    if (to <= copyFrom) return;
    parts.push(v.slice(copyFrom, to));
    runText.push(length);
    runFrom.push(copyFrom);
    runTo.push(-1);
    length += to - copyFrom;
  };
  const put = (s: string, a: number, b: number) => {
    parts.push(s);
    runText.push(length);
    runFrom.push(a);
    runTo.push(b);
    length += s.length;
  };
  for (let i = p; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c !== CR && c !== HASH && c !== DQUOTE) continue;
    const a = source(i);
    if (c === CR) {
      // A CRLF in the source is one line end; a CR and an LF a removed span left side by side
      // were two to v12, which turned CRs into LFs before removing anything.
      const crlf = v.charCodeAt(i + 1) === LF && source(i + 1) === a + 1;
      copy(i);
      put('\n', a, crlf ? a + 2 : a + 1);
      if (crlf) i++;
      copyFrom = i + 1;
      continue;
    }
    if (c === DQUOTE) {
      if (!mask || ((mask[a] ?? 0) & QUOTE) === 0) continue;
      copy(i);
      put("'", a, a + 1);
      copyFrom = i + 1;
      continue;
    }
    let j = i + 1;
    while (j < v.length && isWord(v.charCodeAt(j))) j++;
    if (j === i + 1 || v.charCodeAt(j) !== SEMI) continue;
    copy(i);
    put(/^\d+$/.test(v.slice(i + 1, j)) ? 'ﬂ°°' : 'ﬂ°', a, a + 1);
    copyFrom = i + 1;
    copy(j);
    const semi = source(j);
    put('¶ß', semi, semi + 1);
    copyFrom = j + 1;
    i = j;
  }
  copy(v.length);
  put('\n', src.length, src.length);
  const texts = Int32Array.from(runText);
  const runStarts = Int32Array.from(runFrom);
  const tos = Int32Array.from(runTo);
  /** The run holding `text[k]`, or -1 past the end. */
  const runOf = (k: number): number => {
    if (k < 0 || k >= length) return -1;
    let lo = 0;
    let hi = texts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((texts[mid] ?? 0) <= k) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const start = (k: number): number => {
    const r = runOf(k);
    if (r < 0) return src.length;
    const to = tos[r] ?? -1;
    return to >= 0 ? (runStarts[r] ?? 0) : source((runStarts[r] ?? 0) + k - (texts[r] ?? 0));
  };
  return {
    text: parts.join(''),
    start,
    end: (k) => {
      const r = runOf(k);
      if (r < 0) return src.length;
      const to = tos[r] ?? -1;
      return to >= 0 ? to : start(k) + 1;
    },
  };
}

/** One lex. Offsets are into {@link LexText.text}; {@link emit} maps them to the source. */
class UsecaseLexer {
  private readonly text: string;
  private readonly n: number;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private readonly at: number[] = [];
  private readonly to: number[] = [];
  private mode = MODE_DEFAULT;
  /** The kind of the last match of {@link scan}. */
  private kind = SKIP;

  // Memos that keep failed or repeated scans linear.
  /** A `"` string starting before this fails: its line has no closing quote. */
  private doubleFails = -1;
  /** A `'` string starting before this fails: its line has no closing quote. */
  private singleFails = -1;
  /** Where the last `}` search started and what it found (-1: none). */
  private braceFrom = -1;
  private braceAt = UNSET;

  constructor(
    private readonly src: string,
    from: number,
    private readonly input: LexText,
    view: SourceView
  ) {
    this.text = input.text;
    this.n = this.text.length;
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    // About one token per four characters of usecase text.
    this.w = new TokenWriter((this.n >> 2) + 8);
  }

  run(): Lexed {
    const { n } = this;
    let p = 0;
    let error = -1;
    while (p < n) {
      const end = this.scan(p);
      if (end < 0) {
        // No rule matches: skip to the next offset where one does, as Chevrotain does.
        if (error < 0) error = p;
        p++;
        continue;
      }
      if (error >= 0) {
        this.emit(Kind.Error, error, p);
        error = -1;
      }
      if (this.kind !== SKIP) this.emit(this.kind, p, end);
      this.enter(this.kind);
      p = end;
    }
    if (error >= 0) this.emit(Kind.Error, error, n);
    this.trivia(this.src.length + 1);
    const tokens = this.w.finish(this.src);
    // The EOF token has no text.
    this.at.push(-1);
    this.to.push(-1);
    return {
      tokens,
      input: this.input,
      at: Int32Array.from(this.at),
      to: Int32Array.from(this.to),
    };
  }

  /** The mode after a token of `kind` (Chevrotain's `push_mode` / `pop_mode`). */
  private enter(kind: number): void {
    if (kind === T.JsonDeclarationStart) this.mode = MODE_JSON;
    else if (kind === T.StereotypeStart) this.mode = MODE_STEREOTYPE;
    else if (
      kind === T.JsonObjectLiteral ||
      kind === T.UnclosedJsonObjectLiteral ||
      kind === T.StereotypeEnd ||
      kind === T.UnclosedStereotypeText
    ) {
      this.mode = MODE_DEFAULT;
    }
  }

  /** The end of the rule that matches at `p` in the current mode (its kind in {@link kind}), or -1. */
  private scan(p: number): number {
    if (this.mode === MODE_JSON) return this.json(p);
    if (this.mode === MODE_STEREOTYPE) return this.stereotype(p);
    const { text } = this;
    const c = text.charCodeAt(p);
    if (isBlank(c)) return this.match(SKIP, this.blanks(p));
    if (c === DQUOTE && text.charCodeAt(p + 1) === BACKTICK) return this.markdown(p);
    if (c === PERCENT && text.charCodeAt(p + 1) === PERCENT && this.lineStart(p)) {
      return this.match(Kind.Comment, this.lineEnd(p + 2));
    }
    if (c === LF) return this.match(Kind.Newline, p + 1);
    if (isLetter(c)) {
      const e = this.letters(p, c);
      if (e >= 0) return e;
    }
    const e = this.operator(p, c);
    if (e >= 0) return e;
    return this.rest(p, c);
  }

  private match(kind: number, end: number): number {
    this.kind = kind;
    return end;
  }

  // --- Rules --------------------------------------------------------------------------------

  /** `MARKDOWN_STRING` to the first backtick and quote, else `UNCLOSED_MARKDOWN_STRING` to the end. */
  private markdown(p: number): number {
    const close = this.text.indexOf('`"', p + 2);
    return close < 0
      ? this.match(T.UnclosedMarkdownString, this.n)
      : this.match(T.MarkdownString, close + 2);
  }

  /**
   * The rules before the operators that start with a letter: the accessibility lines (at a
   * line start), `JSON_DECLARATION_START`, the keywords.
   */
  private letters(p: number, c: number): number {
    const { text } = this;
    if (c === LOWER_A && text.startsWith('acc', p) && this.lineStart(p)) {
      const e = this.accessibility(p);
      if (e >= 0) return e;
    }
    if (c === LOWER_J && text.startsWith('json', p)) {
      const e = this.jsonStart(p + 4);
      if (e >= 0) return this.match(T.JsonDeclarationStart, e);
    }
    for (const [word, kind] of KEYWORDS) {
      if (!this.startsWord(p, word, ANY_CASE.has(kind))) continue;
      const id = this.word(p);
      return id - p > word.length
        ? this.match(T.Identifier, id)
        : this.match(kind, p + word.length);
    }
    return -1;
  }

  /** Whether `word` starts at `p` (ASCII case-insensitive when `anyCase`). */
  private startsWord(p: number, word: string, anyCase: boolean): boolean {
    const { text } = this;
    if (!anyCase) return text.startsWith(word, p);
    for (let k = 0; k < word.length; k++) {
      const c = text.charCodeAt(p + k);
      if ((c | CASE_BIT) !== word.charCodeAt(k) || !isLetter(c)) return false;
    }
    return true;
  }

  /**
   * `ACC_DESCR_BLOCK` (`accDescr[\t ]*{` to the first `}`), `ACC_TITLE_LINE` and
   * `ACC_DESCR_LINE` (`acc…[\t ]*:` and the rest of the line), in v12's order; `accTitle` and
   * `accDescr` exclude each other, so one prefix test and one blank run serve all three. The
   * caller checked the line start.
   */
  private accessibility(p: number): number {
    const { text } = this;
    const descr = text.startsWith('accDescr', p);
    if (!descr && !text.startsWith('accTitle', p)) return -1;
    const b = this.blanks(p + 8);
    const c = text.charCodeAt(b);
    if (descr && c === LBRACE) {
      const close = this.brace(b + 1);
      if (close >= 0) return this.match(T.AccDescrBlock, close + 1);
    }
    if (c !== COLON) return -1;
    return this.match(descr ? T.AccDescrLine : T.AccTitleLine, this.lineEnd(b + 1));
  }

  /** After `json`: `[\t ]+\w+[\t ]*@[\t ]*` before a `{`; its end, or -1. */
  private jsonStart(q: number): number {
    const { text } = this;
    const a = this.blanks(q);
    if (a === q) return -1;
    const b = this.word(a);
    if (b === a) return -1;
    const at = this.blanks(b);
    if (text.charCodeAt(at) !== AT) return -1;
    const e = this.blanks(at + 1);
    return text.charCodeAt(e) === LBRACE ? e : -1;
  }

  /** The operators, `@{`, `@`, braces, brackets, parentheses, `,` and `:`, in v12's order. */
  private operator(p: number, c: number): number {
    const { text } = this;
    const c1 = text.charCodeAt(p + 1);
    if (c === DASH && c1 === DASH) return this.dashOperator(p);
    if (c === DOT && c1 === DOT && text.charCodeAt(p + 2) === GT) {
      return this.match(T.DependencyArrow, p + 3);
    }
    if (c === LT && c1 === LT) return this.match(T.StereotypeStart, p + 2);
    if (c === COLON && c1 === COLON && text.charCodeAt(p + 2) === COLON) {
      return this.match(T.ClassSeparator, p + 3);
    }
    if (c === LT && c1 === DASH && text.charCodeAt(p + 2) === DASH) {
      return this.match(T.BackwardSolid, this.dashes(p + 1));
    }
    if ((c === LOWER_O || c === LOWER_X) && c1 === DASH && text.charCodeAt(p + 2) === DASH) {
      return this.match(c === LOWER_O ? T.BackwardCircle : T.BackwardCross, p + 3);
    }
    if (c === AT)
      return this.match(c1 === LBRACE ? T.MetadataStart : T.At, c1 === LBRACE ? p + 2 : p + 1);
    const single = SINGLE.get(c);
    return single === undefined ? -1 : this.match(single, p + 1);
  }

  /** At `--`: `--|>`, `--+>`, `--o`, `--x`, else the whole dash run. */
  private dashOperator(p: number): number {
    const { text } = this;
    if (text.charCodeAt(p + 2) === PIPE && text.charCodeAt(p + 3) === GT) {
      return this.match(T.Generalization, p + 4);
    }
    const d = this.dashes(p);
    if (text.charCodeAt(d) === GT) return this.match(T.ForwardSolid, d + 1);
    const c2 = text.charCodeAt(p + 2);
    if (c2 === LOWER_O) return this.match(T.ForwardCircle, p + 3);
    if (c2 === LOWER_X) return this.match(T.ForwardCross, p + 3);
    return this.match(T.MarkerlessSolid, d);
  }

  /**
   * After the operators: `HASH_COLOR`, `PLAIN_STRING`, `CSS_IDENTIFIER`, `IDENTIFIER` (or the
   * longer `NUMBER`), `NUMBER`, `CSS_ESCAPED_COMMA`, `DASH`, `DOT`, `PERCENT`,
   * `CSS_PUNCTUATION`, `LABEL_PUNCTUATION`, `LABEL_SYMBOL`.
   */
  private rest(p: number, c: number): number {
    const { text } = this;
    if (c === HASH && isHex(text.charCodeAt(p + 1))) {
      let e = p + 1;
      while (isHex(text.charCodeAt(e))) e++;
      return this.match(T.HashColor, e);
    }
    if (c === DQUOTE || c === APOSTROPHE) return this.string(p, c);
    if (isLetter(c) || c === UNDERSCORE) {
      const e = this.css(p);
      if (e >= 0) return this.match(T.CssIdentifier, e);
    }
    if (isWord(c)) {
      const id = this.word(p);
      const num = isDigit(c) ? this.number(p) : -1;
      return num > id ? this.match(T.Number, num) : this.match(T.Identifier, id);
    }
    if (c === DOT && isDigit(text.charCodeAt(p + 1))) return this.match(T.Number, this.number(p));
    if (c === BACKSLASH && text.charCodeAt(p + 1) === COMMA) {
      return this.match(T.CssEscapedComma, p + 2);
    }
    if (c === DASH) return this.match(T.Dash, p + 1);
    if (c === DOT) return this.match(T.Dot, p + 1);
    if (c === PERCENT) return this.match(T.Percent, p + 1);
    if (isCssPunctuation(c)) return this.match(T.CssPunctuation, p + 1);
    if (isLabelPunctuation(c)) return this.match(T.LabelPunctuation, p + 1);
    if (isSymbol(c)) {
      let e = p + 1;
      while (e < this.n && isSymbol(text.charCodeAt(e))) e++;
      return this.match(T.LabelSymbol, e);
    }
    return -1;
  }

  /** `"[^\n\r"]*"` or `'[^\n\r']*'` from `p`; -1 when the line has no closing quote. */
  private string(p: number, quote: number): number {
    const double = quote === DQUOTE;
    if (p < (double ? this.doubleFails : this.singleFails)) return -1;
    const { text, n } = this;
    let j = p + 1;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === quote) return this.match(T.PlainString, j + 1);
      if (c === LF) break;
      j++;
    }
    // Every start of this kind before `j` reads to the same line end without a quote.
    if (double) this.doubleFails = j;
    else this.singleFails = j;
    return -1;
  }

  /** `[A-Z_a-z]\w*(?:-\w+)+` from `p`: its end, or -1 without a `-` word. */
  private css(p: number): number {
    const { text } = this;
    let e = this.word(p);
    let parts = 0;
    while (text.charCodeAt(e) === DASH && isWord(text.charCodeAt(e + 1))) {
      e = this.word(e + 1);
      parts++;
    }
    return parts > 0 ? e : -1;
  }

  /**
   * `(?:\d+\.\d+|\d+|\.\d+)(?:[A-Za-z]+)?` from `p` (a digit or a `.` before one): its end.
   */
  private number(p: number): number {
    const { text } = this;
    let e = p;
    while (isDigit(text.charCodeAt(e))) e++;
    if (text.charCodeAt(e) === DOT && isDigit(text.charCodeAt(e + 1))) {
      e++;
      while (isDigit(text.charCodeAt(e))) e++;
    }
    while (isLetter(text.charCodeAt(e))) e++;
    return e;
  }

  /** jsonBody: the object at `p` (a `{`), brace- and string-aware, or the rest of the text. */
  private json(p: number): number {
    const { text, n } = this;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = p; i < n; i++) {
      const c = text.charCodeAt(i);
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === DQUOTE) quoted = false;
        continue;
      }
      if (c === DQUOTE) quoted = true;
      else if (c === LBRACE) depth++;
      else if (c === RBRACE && --depth === 0) return this.match(T.JsonObjectLiteral, i + 1);
    }
    return this.match(T.UnclosedJsonObjectLiteral, n);
  }

  /**
   * stereotype: `>>`; else the text up to the first `>>` on the line when it is not blank;
   * else the rest of the line (at least one character); else -1 (a line break).
   */
  private stereotype(p: number): number {
    const { text, n } = this;
    if (text.charCodeAt(p) === GT && text.charCodeAt(p + 1) === GT) {
      return this.match(T.StereotypeEnd, p + 2);
    }
    let j = p;
    let blank = true;
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === LF) break;
      if (c === GT && text.charCodeAt(j + 1) === GT) {
        if (!blank) return this.match(T.StereotypeText, j);
        break;
      }
      if (!isSpace(c)) blank = false;
      j++;
    }
    const e = this.lineEnd(p);
    return e > p ? this.match(T.UnclosedStereotypeText, e) : -1;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** Whether only blanks stand between the line start (or the text start) and `p`. */
  private lineStart(p: number): boolean {
    const { text } = this;
    for (let i = p - 1; i >= 0; i--) {
      const c = text.charCodeAt(i);
      if (c === LF) return true;
      if (!isBlank(c)) return false;
    }
    return true;
  }

  /** The end of the run of `[\t ]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `\w` from `q`. */
  private word(q: number): number {
    let j = q;
    while (j < this.n && isWord(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `-` from `q`. */
  private dashes(q: number): number {
    let j = q;
    while (this.text.charCodeAt(j) === DASH) j++;
    return j;
  }

  /** The end of the run of `[^\n\r]` from `q` (the text has no CR). */
  private lineEnd(q: number): number {
    const e = this.text.indexOf('\n', q);
    return e < 0 ? this.n : e;
  }

  /** The first `}` at or after `q`, or -1; one search serves every start before what it found. */
  private brace(q: number): number {
    const at = this.braceAt;
    if (at !== UNSET && q >= this.braceFrom && (at === -1 || q <= at)) return at;
    this.braceFrom = q;
    this.braceAt = this.text.indexOf('}', q);
    return this.braceAt;
  }

  // --- Output -------------------------------------------------------------------------------

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'drop') continue;
      this.w.push(h.kind === 'comment' ? Kind.Comment : Kind.Directive, h.start, h.end);
      this.at.push(-1);
      this.to.push(-1);
    }
  }

  /** Write the token `text[s, e)` with its source range. */
  private emit(kind: number, s: number, e: number): void {
    const a = this.input.start(s);
    let b = e > s ? this.input.end(e - 1) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = dropAt(this.holes, this.hole, b);
    }
    this.w.push(kind, a, b);
    this.at.push(s);
    this.to.push(e);
  }
}
