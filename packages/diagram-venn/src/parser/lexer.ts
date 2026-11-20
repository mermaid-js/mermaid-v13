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
  DASH,
  DOT,
  DQUOTE,
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
  PERCENT,
  QUOTE,
  RBRACE,
  RBRACKET,
  RPAREN,
  SEMI,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import { entityPlaceholders, lowerCode, StateLexer } from '@mermaid-js/shared/parser/state';
import type { SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateLexerOptions } from '@mermaid-js/shared/parser/state';
import { T } from './tokens.ts';

// Start conditions of venn.jison (`bol` is inclusive: INITIAL's rules apply there too).
const S = { INITIAL: 0, BOL: 1 } as const;

/** Start condition names by number, as jison names them, for the probe's mode (R-LANG-7). */
const S_NAMES = ['INITIAL', 'bol'];

const PLUS = 0x2b;
const APOS = "'";

/** Not in `[^#\n;]` (a title). */
const isTitleStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** In `[0-9.]` (a number of `rgb(…)`). */
const isRgbDigit = (c: number) => isDigit(c) || c === DOT;

/** The end of the run of digits of `text` from `from`. */
function digits(text: string, from: number): number {
  let e = from;
  while (isDigit(text.charCodeAt(e))) e++;
  return e;
}

/** The end of `(\.\d+)?` of `text` at `at`. */
function fraction(text: string, at: number): number {
  return text.charCodeAt(at) === DOT && isDigit(text.charCodeAt(at + 1))
    ? digits(text, at + 2)
    : at;
}

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

/** How v12's lexer read its text (see `StateLexerOptions`). */
const OPTIONS: StateLexerOptions = { charsPerToken: 4, crlf: 'fold', dropSpace: true };

/**
 * Lex the venn body `src[from…]`. `from` and `view` are shared `bodyView`'s `bodyStart` and `view`. With
 * `modeAt` (a probe's offset, R-LANG-7), the start condition there is {@link Lexed.mode}.
 */
export function lex(src: string, from: number, view: SourceView, modeAt?: number): Lexed {
  const lexer = new VennLexer(src, from, view, OPTIONS);
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
class VennLexer extends StateLexer {
  /** Indent mode: on from a `set` or `union` until a line starts with anything else. */
  private indent = false;
  /** The next `"` at or after the last lookup (-2: not looked up; -1: none). */
  private nextQuote = -2;
  /** The next `]` or `"` at or after the last lookup (-2: not looked up). */
  private nextLabelStop = -2;
  /** The start condition at the offset `run` was given. */
  mode: string | undefined;

  /**
   * `text` with v12's other rewrites that change what a rule matches, each in place (the
   * length is kept): a `"` that v12's `cleanupText` turned into `'` reads `'`, and each
   * `#name;` entity reads `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's placeholders).
   */
  protected override prepare(text: string, { mask }: SourceView): string {
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
    return entityPlaceholders(out);
  }

  run(modeAt?: number): TokenStream {
    const { text, n } = this;
    this.trim();
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

  // --- Scans --------------------------------------------------------------------------------

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

  /** Whether the keyword `word` (lower case) is at `q`, followed by `\b`. */
  private keyword(word: string, q: number): boolean {
    return this.literal(word, q) && !isWord(this.text.charCodeAt(q + word.length));
  }

  // --- Rules --------------------------------------------------------------------------------

  protected step(c: number): void {
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
    if (lowerCode(c) === 0x72 && this.rgb()) return true;
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
    const lc = lowerCode(c);
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
    const start = c === PLUS || c === DASH ? p + 1 : p;
    if (isDigit(text.charCodeAt(start))) return fraction(text, digits(text, start));
    const e = fraction(text, start);
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
