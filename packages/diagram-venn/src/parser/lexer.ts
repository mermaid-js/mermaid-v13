// cspell:words unput
/**
 * Venn lexer: a state machine mirroring the start conditions and rule order of v12's
 * `venn.jison` (parser-method §1), built on the kanban lexer's source mapping:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}),
 *   line breaks as v12 had them (CRLF and CR as LF), each `#name;` entity as an opaque run
 *   (v12's placeholder: no rule takes its `#` or `;`) and each `"` v12 turned into `'` as
 *   `'`, and maps each token back to its range in the source, which is never rewritten. A
 *   token that runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so is
 *   a dropped `;` that no token took (`Space`). Skipped blanks are no token.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only) and each keyword ends in `\b`; the two comment rules
 * come first in both states, and the second (`[^\}]\%\%[^\n]*`) eats the character before a
 * `%%` at a token start, a line break too; `title\s` takes one `\s` of any kind, a line break
 * too, so a bare `title` line takes the next line; `[^\n]` stops at LF only.
 *
 * The `bol` start condition (inclusive) is entered by every line-break run. There, blanks
 * before a line break are skipped; blanks before `text` are `INDENT_TEXT` while indent mode is
 * on (and the `text` after them is a kind with no jison name), else skipped; other blanks are
 * skipped; any other character turns indent mode off and returns to INITIAL, consuming
 * nothing (jison's `unput`). v12's parser turns the mode on in the action of each `set` and
 * `union` statement, which always runs before the next line start; here each `SET` and
 * `UNION` token turns it on, which is the same at every place the mode is read.
 *
 * jison throws where no rule matches; that is a one-character `Kind.Error` (a code point) and
 * lexing goes on in the same state. Every scan is linear in the text it consumes (R-PARSE-7):
 * the scans to the next quote and to the next `]` or quote are cached, so failed bracket and
 * string matches do not rescan.
 */
import {
  codePointEnd,
  COLON,
  COMMA,
  cook,
  CR,
  DASH,
  DOT,
  DQUOTE,
  firstHole,
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
  PERCENT,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  SourceOffsets,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of venn.jison (`bol` is inclusive: INITIAL's rules apply there too).
const S = { INITIAL: 0, BOL: 1 } as const;

/** Start condition names by number, as jison names them, for the probe's mode (R-LANG-7). */
const S_NAMES = ['INITIAL', 'bol'];

const PLUS = 0x2b;
const APOS = "'";

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** Not in `[^#\n;]` (a title). */
const isTitleStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** In `[0-9.]` (a number of `rgb(…)`). */
const isRgbDigit = (c: number) => isDigit(c) || c === DOT;

/** A lex: the token stream, and the text of each token as v12's parser read it. */
export interface Lexed {
  /** Ends in `Kind.EOF`; trivia (comments, directives, a dropped `;`) is in it. */
  readonly tokens: TokenStream;
  /**
   * The text of token `j`: its source range with entities, CRLF and removed spans applied
   * ({@link cook}), and the rewrites of `venn.jison`'s actions: a `["…"]` label reads its
   * inside, a `[…]` label its inside trimmed. Read token text only through this.
   */
  text(j: number): string;
  /**
   * The same text for a token given by its kind and range, for a parser reading a view of the
   * significant tokens (`significantTokens`), whose indexes are not the stream's.
   */
  textOf(kind: number, start: number, end: number): string;
  /**
   * With `modeAt`, jison's start condition at that source offset (`INITIAL` or `bol`): that of
   * the step whose text holds it, else of the first step at or after it (the probe's `lexed`
   * rule).
   */
  readonly mode?: string;
}

/**
 * Lex the venn body `src[from…]`. `from` and `view` come from `vennView` (`./index.ts`). With
 * `modeAt` (a probe's offset, R-LANG-7), the start condition there is {@link Lexed.mode}.
 */
export function lex(src: string, from: number, view: SourceView, modeAt?: number): Lexed {
  const lexer = new VennLexer(src, from, view);
  const tokens = lexer.run(modeAt);
  const { mode } = lexer;
  const textOf = (kind: number, start: number, end: number): string => {
    const text = cook(src, start, end, view);
    if (kind === T.QuotedLabel) return text.slice(2, -2);
    return kind === T.Label ? text.slice(1, -1).trim() : text;
  };
  return {
    tokens,
    textOf,
    text: (j) => textOf(tokens.kind[j] ?? 0, tokens.start[j] ?? 0, tokens.end[j] ?? 0),
    ...(mode === undefined ? {} : { mode }),
  };
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 */
class VennLexer {
  /** The text v12 lexed (see the file comment), plus the line break v12 appended. */
  private readonly text: string;
  /** Length of v12's text without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  /**
   * `at[i]` is the view-text offset of `text[i]` (`at[len]` its end), when a CR made the two
   * differ; else undefined and they are the same.
   */
  private readonly at: Uint32Array | undefined;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly w: TokenWriter;
  private state: number = S.INITIAL;
  /** Indent mode: on from a `set` or `union` until a line starts with anything else. */
  private indent = false;
  private p: number;
  /** The next `"` at or after the last lookup (-2: not looked up; -1: none). */
  private nextQuote = -2;
  /** The next `]` or `"` at or after the last lookup (-2: not looked up). */
  private nextLabelStop = -2;
  /** The start condition at the offset `run` was given. */
  mode: string | undefined;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    const start = localOffset(view, from);
    const { text, at } = this.v12Text(view.text, start);
    this.at = at;
    this.len = text.length;
    this.text = this.placeholders(text, view.mask) + '\n';
    this.n = this.text.length;
    this.p = start;
    // About one token per four characters of venn text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
  }

  /**
   * `raw` with every CRLF and lone CR as one LF, as v12 had it, and where each character came
   * from. A CR and an LF that a removed span left side by side are two line ends: v12 turned
   * CRs into LFs before it removed anything. Offsets before `start` are kept as they are.
   */
  private v12Text(raw: string, start: number): { text: string; at: Uint32Array | undefined } {
    if (!raw.includes('\r', start)) return { text: raw, at: undefined };
    const at = new Uint32Array(raw.length + 1);
    const out: string[] = [];
    let k = 0;
    let run = 0;
    for (let q = 0; q < raw.length; q++) {
      at[k++] = q;
      if (raw.charCodeAt(q) !== CR) continue;
      out.push(raw.slice(run, q), '\n');
      run = q + 1;
      if (q >= start && raw.charCodeAt(q + 1) === LF && this.adjacent(q)) {
        q++;
        run = q + 1;
      }
    }
    out.push(raw.slice(run));
    at[k] = raw.length;
    return { text: out.join(''), at: at.subarray(0, k + 1) };
  }

  /**
   * `text` with v12's other rewrites that change what a rule matches, each in place (the
   * length is kept): a `"` that v12's `cleanupText` turned into `'` reads `'`, and each
   * `#name;` entity reads `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's placeholders).
   */
  private placeholders(text: string, mask: Uint8Array | undefined): string {
    let out = text;
    if (mask && out.includes('"')) {
      const parts: string[] = [];
      let run = 0;
      for (let q = out.indexOf('"'); q !== -1; q = out.indexOf('"', q + 1)) {
        if (((mask[this.source(q)] ?? 0) & QUOTE) === 0) continue;
        parts.push(out.slice(run, q), APOS);
        run = q + 1;
      }
      parts.push(out.slice(run));
      out = parts.join('');
    }
    if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
    return out;
  }

  /** Whether view-text offsets `q` and `q + 1` are next to each other in the source. */
  private adjacent(q: number): boolean {
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1;
  }

  run(modeAt?: number): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    // Two loops, so a plain lex does no probe work per step.
    if (modeAt === undefined) while (this.p < n) this.step(text.charCodeAt(this.p));
    else {
      while (this.p < n) {
        const before = this.source(this.p);
        const state = this.state;
        this.step(text.charCodeAt(this.p));
        if (this.mode === undefined && (before >= modeAt || this.source(this.p) > modeAt))
          this.mode = S_NAMES[state];
      }
      this.mode ??= S_NAMES[this.state];
    }
    // `<<EOF>>` is in every start condition.
    this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** View-text offset of `text[i]`. */
  private view(i: number): number {
    return this.at ? (this.at[i] ?? 0) : i;
  }

  /** Source offset of `text[i]`; the end of the source from the appended line break on. */
  private source(i: number): number {
    if (i >= this.len) return this.src.length;
    const v = this.view(i);
    return this.offsets ? this.offsets.source(v) : v;
  }

  /** Source offset just past the last source character of `text[i]` (a CRLF's LF). */
  private sourceEnd(i: number): number {
    const v = this.view(i + 1) - 1;
    return (this.offsets ? this.offsets.source(v) : v) + 1;
  }

  /**
   * Write the removed spans that start before `at` (a source offset) as trivia. A dropped `;`
   * that no token's range took (one after skipped blanks) is a `Space` token of its own.
   */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      if (h.kind === 'comment') this.w.push(Kind.Comment, h.start, h.end);
      else if (h.kind === 'directive') this.w.push(Kind.Directive, h.start, h.end);
      else if (h.start >= this.covered) this.w.push(Kind.Space, h.start, h.end);
    }
  }

  /** Write the token `text[s, end)` with its source range, and move to `end`. */
  private emit(kind: number, s: number, end: number): void {
    const a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.sourceEnd(last - 1) : a;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    if (b > this.covered) this.covered = b;
    this.p = end;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The end of the run of `[ \t]` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isBlank(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of `\s` from `q`. */
  private spaces(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The first LF at or after `q` (the appended one at the latest). */
  private lineEnd(q: number): number {
    const e = this.text.indexOf('\n', q);
    return e === -1 ? this.n : e;
  }

  /** The first `"` at or after `q`, or -1. `q` never decreases between calls. */
  private quote(q: number): number {
    let e = this.nextQuote;
    if (e === -2 || (e !== -1 && e < q)) this.nextQuote = e = this.text.indexOf('"', q);
    return e;
  }

  /** The first `]` or `"` at or after `q`, or the end. `q` never decreases between calls. */
  private labelStop(q: number): number {
    let e = this.nextLabelStop;
    if (e === -2 || e < q) {
      e = q;
      while (e < this.n) {
        const c = this.text.charCodeAt(e);
        if (c === RBRACKET || c === DQUOTE) break;
        e++;
      }
      this.nextLabelStop = e;
    }
    return e;
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  private literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }

  /** Whether the keyword `word` (lower case) is at `q`, followed by `\b`. */
  private keyword(word: string, q: number): boolean {
    return this.literal(word, q) && !isWord(this.text.charCodeAt(q + word.length));
  }

  // --- Rules --------------------------------------------------------------------------------

  private step(c: number): void {
    const { text, p } = this;
    const d = text.charCodeAt(p + 1);
    // `\%\%(?!\{)[^\n]*`, then `[^\}]\%\%[^\n]*` (it eats the character before the `%%`).
    if (
      (c === PERCENT && d === PERCENT && text.charCodeAt(p + 2) !== LBRACE) ||
      (c !== RBRACE && d === PERCENT && text.charCodeAt(p + 2) === PERCENT)
    ) {
      this.emit(Kind.Comment, p, this.lineEnd(p + 1));
      return;
    }
    if (this.state === S.BOL && this.bol(c)) return;
    // `[\n\r]+` (CRs are LFs by now) enters `bol`.
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Newline, p, e);
      this.state = S.BOL;
      return;
    }
    // `\%\%[^\n]*`: a `%%{` the first comment rule left.
    if (c === PERCENT && d === PERCENT) {
      this.emit(Kind.Comment, p, this.lineEnd(p + 2));
      return;
    }
    // `[ \t]+`: skipped.
    if (isBlank(c)) {
      this.p = this.blanks(p);
      return;
    }
    if (!this.word(c) && !this.punctuation(c)) this.emit(Kind.Error, p, codePointEnd(text, p));
  }

  /** The `<bol>` rules. False when none applies (a line break). */
  private bol(c: number): boolean {
    const { p } = this;
    if (isBlank(c)) {
      const b = this.blanks(p);
      // `[ \t]+(?=text\b)` with indent mode on: INDENT_TEXT, and the `text` returns nothing.
      if (this.indent && this.keyword('text', b)) {
        this.emit(T.IndentText, p, b);
        this.emit(T.IndentTextKeyword, b, b + 4);
        this.state = S.INITIAL;
        return true;
      }
      // `[ \t]+(?=[\n\r])`, `[ \t]+(?=text\b)` with the mode off, `[ \t]+`: skipped.
      this.p = b;
      return true;
    }
    if (c === LF) return false;
    // `[^ \t\n\r]`: indent mode off, back to INITIAL, nothing consumed (jison's `unput`).
    this.indent = false;
    this.state = S.INITIAL;
    return true;
  }

  /** The keyword and word rules, in jison's order. False when none matches. */
  private word(c: number): boolean {
    const { p } = this;
    if (this.keywords(c)) return true;
    if (c === LBRACKET) return this.label();
    const num = this.numeric(c);
    if (num > p) {
      this.emit(T.Numeric, p, num);
      return true;
    }
    if (c === HASH) return this.hex();
    if (lower(c) === 0x72 && this.rgb()) return true;
    // `[A-Za-z_][A-Za-z0-9\-_]*`.
    if (isLetter(c) || c === UNDERSCORE) {
      const { text } = this;
      let e = p + 1;
      for (let k = text.charCodeAt(e); isWord(k) || k === DASH; k = text.charCodeAt(++e));
      this.emit(T.Identifier, p, e);
      return true;
    }
    return false;
  }

  /** `"title"\s[^#\n;]+`, then the keywords, each with `\b`. */
  private keywords(c: number): boolean {
    const { text, p } = this;
    const lc = lower(c);
    if (
      lc === 0x74 &&
      this.literal('title', p) &&
      isSpace(text.charCodeAt(p + 5)) &&
      p + 6 < this.n &&
      !isTitleStop(text.charCodeAt(p + 6))
    ) {
      let e = p + 7;
      while (e < this.n && !isTitleStop(text.charCodeAt(e))) e++;
      this.emit(T.Title, p, e);
      return true;
    }
    if (lc === 0x76 && this.keyword('venn-beta', p)) return this.token(T.Venn, 9);
    if (lc === 0x73 && this.keyword('set', p)) {
      this.indent = true;
      return this.token(T.Set, 3);
    }
    if (lc === 0x75 && this.keyword('union', p)) {
      this.indent = true;
      return this.token(T.Union, 5);
    }
    if (lc === 0x74 && this.keyword('text', p)) return this.token(T.Text, 4);
    if (lc === 0x73 && this.keyword('style', p)) return this.token(T.Style, 5);
    return false;
  }

  /** `\[\"[^\"]*\"\]`, then `\[[^\]\"]+\]`, at a `[`. */
  private label(): boolean {
    const { text, p } = this;
    if (text.charCodeAt(p + 1) === DQUOTE) {
      const q = this.quote(p + 2);
      if (q === -1 || text.charCodeAt(q + 1) !== RBRACKET) return false;
      this.emit(T.QuotedLabel, p, q + 2);
      return true;
    }
    const e = this.labelStop(p + 1);
    if (e === p + 1 || text.charCodeAt(e) !== RBRACKET) return false;
    this.emit(T.Label, p, e + 1);
    return true;
  }

  /** `\#[0-9a-fA-F]{3,8}`, at a `#`. */
  private hex(): boolean {
    const { text, p } = this;
    let e = p + 1;
    while (e < p + 9 && isHex(text.charCodeAt(e))) e++;
    if (e < p + 4) return false;
    this.emit(T.HexColor, p, e);
    return true;
  }

  /** `rgba(…)` with four numbers, then `rgb(…)` with three, at an `r`. */
  private rgb(): boolean {
    const { p } = this;
    const four = this.literal('rgba(', p);
    if (!four && !this.literal('rgb(', p)) return false;
    const e = four ? this.numbers(p + 5, 4) : this.numbers(p + 4, 3);
    if (e < 0) return false;
    this.emit(four ? T.RgbaColor : T.RgbColor, p, e);
    return true;
  }

  /** `"[^"]*"`, `,` and `:`. False when none matches. */
  private punctuation(c: number): boolean {
    const { p } = this;
    if (c === DQUOTE) {
      const q = this.quote(p + 1);
      if (q === -1) return false;
      this.emit(T.String, p, q + 1);
      return true;
    }
    if (c === COMMA) return this.token(T.Comma, 1);
    if (c === COLON) return this.token(T.Colon, 1);
    return false;
  }

  /** Write a token of `length` characters at `p`. */
  private token(kind: number, length: number): true {
    this.emit(kind, this.p, this.p + length);
    return true;
  }

  /** The end of `[+-]?(\d+(\.\d+)?|\.\d+)` at `p`, or `p`. */
  private numeric(c: number): number {
    const { text, p } = this;
    const digits = (from: number) => {
      let e = from;
      while (isDigit(text.charCodeAt(e))) e++;
      return e;
    };
    const fraction = (at: number) =>
      text.charCodeAt(at) === DOT && isDigit(text.charCodeAt(at + 1)) ? digits(at + 2) : at;
    const start = c === PLUS || c === DASH ? p + 1 : p;
    if (isDigit(text.charCodeAt(start))) return fraction(digits(start));
    const e = fraction(start);
    return e > start ? e : p;
  }

  /**
   * The end of `count` numbers `\s*[0-9.]+\s*` separated by `,` and closed by `)`, from
   * `from` (just past `rgb(` or `rgba(`), or -1.
   */
  private numbers(from: number, count: number): number {
    const { text } = this;
    let q = from;
    for (let k = 0; k < count; k++) {
      q = this.spaces(q);
      if (!isRgbDigit(text.charCodeAt(q))) return -1;
      while (isRgbDigit(text.charCodeAt(q))) q++;
      q = this.spaces(q);
      const sep = text.charCodeAt(q);
      if (sep !== (k === count - 1 ? RPAREN : COMMA)) return -1;
      q++;
    }
    return q;
  }
}
