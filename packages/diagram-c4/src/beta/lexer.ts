/**
 * c4-beta lexer: one pass over the body, with no start conditions, that emits the tokens of
 * `grammar/c4beta.ebnf` (spec #730). The reference lexer built from that file is the gate: the
 * two give the same tokens on every source (`conformance/src/c4beta/grammar`).
 *
 * `title`, `accTitle:` and `accDescr:` take the rest of the line up to a `%%` as one token, and
 * `accDescr { … }` runs to its `}`. A word is an id unless it is a keyword; the lexer gives
 * each keyword its own kind and the parser reads the ones that open no statement as ids. Every
 * scan is linear in the text it consumes (R-PARSE-7).
 *
 * Directives core found (`%%{ … }%%`) are trivia tokens of their own. Text no rule matches is a
 * `Kind.Error` token of one character, or, for an unclosed string or `accDescr {`, of the rest
 * of the line.
 */
import {
  codePointEnd,
  CR,
  DASH,
  GT,
  DQUOTE,
  APOSTROPHE,
  BACKSLASH,
  COLON,
  COMMA,
  HASH,
  isBlank,
  isLineEnd,
  isDigit,
  isHex,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  LPAREN,
  LT,
  PERCENT,
  RBRACE,
  RPAREN,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { BETA, BETA_KEYWORDS } from './tokens.ts';

/** `<-->` before `<--`, which it starts with. `---` is checked apart: `----` and `--->` are not it. */
const ARROWS: readonly (readonly [string, number])[] = [
  ['<-->', BETA.ArrowBoth],
  ['-->', BETA.ArrowRight],
  ['<--', BETA.ArrowLeft],
];
/** The undirected arrow, unless a `-` or `>` follows it. */
const UNDIRECTED = '---';
const SINGLES: ReadonlyMap<number, number> = new Map([
  [COMMA, BETA.Comma],
  [LBRACE, BETA.Lbrace],
  [RBRACE, BETA.Rbrace],
]);
type Scan = 'string' | 'colon' | 'hex' | 'arrow' | 'percent' | 'single';
/** The scan that starts at each character that is not a word character. */
const SCANS: ReadonlyMap<number, Scan> = new Map([
  [DQUOTE, 'string'],
  [APOSTROPHE, 'string'],
  [COLON, 'colon'],
  [HASH, 'hex'],
  [DASH, 'arrow'],
  [LT, 'arrow'],
  [PERCENT, 'percent'],
  [COMMA, 'single'],
  [LBRACE, 'single'],
  [RBRACE, 'single'],
]);

const ACC_TITLE = 'accTitle';
const ACC_DESCR = 'accDescr';
/** How many digits a hex colour has: 3 or 6, or 4 or 8 with an alpha. */
const HEX_DIGITS: ReadonlySet<number> = new Set([3, 4, 6, 8]);
/** The words that, with a `(` right after them, open a colour function. */
const COLOR_FUNCTIONS: ReadonlySet<string> = new Set(['rgb', 'rgba', 'hsl', 'hsla']);

/** Lex the c4-beta body `src[from…]`; `directives` are the ranges core found. */
export function lex(src: string, from: number, directives: readonly Range[]): TokenStream {
  return new C4BetaLexer(src, from, directives).run();
}

class C4BetaLexer {
  private readonly w: TokenWriter;
  private p: number;
  /** Only blanks, comments or directives since the last line break: where a step may start. */
  private lineStart = true;
  private nextDirective = 0;
  /** From this offset on there is no `}`: an unclosed `accDescr {` need not look again. */
  private noBraceFrom = Infinity;
  /**
   * Before the first token: there any whitespace regex `\s` matches is a blank (a byte-order
   * mark, a no-break space), as the detector's `^\s*c4-beta` reads it. After it, only `[\t ]`.
   */
  private leading = true;

  constructor(
    private readonly src: string,
    from: number,
    private readonly directives: readonly Range[]
  ) {
    this.p = from;
    this.w = new TokenWriter(Math.max(16, src.length >> 2));
  }

  run(): TokenStream {
    const { src } = this;
    while (this.p < src.length) {
      const c = src.charCodeAt(this.p);
      if (this.blank(c)) this.p++;
      else if (this.directive()) continue;
      else if (c === LF || c === CR) this.newline(c);
      else this.token(c);
    }
    return this.w.finish(src);
  }

  /** A blank: a tab or space, and before the first token any `\s` but a line break. */
  private blank(c: number): boolean {
    return isBlank(c) || (this.leading && isSpace(c) && c !== LF && c !== CR);
  }

  private emit(kind: number, end: number): void {
    this.w.push(kind, this.p, end);
    this.p = end;
    this.lineStart = false;
    this.leading = false;
  }

  /** A directive at the offset: its own trivia token; the line start stays. */
  private directive(): boolean {
    const { directives } = this;
    // A directive inside a token or a comment is part of its text, not trivia.
    while ((directives[this.nextDirective]?.start ?? this.p) < this.p) this.nextDirective++;
    const d = directives[this.nextDirective];
    if (!d || d.start !== this.p) return false;
    this.w.push(Kind.Directive, d.start, d.end);
    this.p = d.end;
    this.nextDirective++;
    return true;
  }

  private newline(c: number): void {
    const crlf = c === CR && this.src.charCodeAt(this.p + 1) === LF;
    this.w.push(Kind.Newline, this.p, this.p + (crlf ? 2 : 1));
    this.p += crlf ? 2 : 1;
    this.lineStart = true;
  }

  private token(c: number): void {
    const scan = SCANS.get(c);
    if (scan) this[scan](c);
    else if (isWord(c)) this.word();
    else this.emit(Kind.Error, codePointEnd(this.src, this.p));
  }

  /** `,`, `{` and `}`. */
  private single(c: number): void {
    this.emit(SINGLES.get(c) ?? Kind.Error, this.p + 1);
  }

  /** `%%` starts a comment; a lone `%` is an error. */
  private percent(): void {
    if (this.src.charCodeAt(this.p + 1) === PERCENT) this.comment();
    else this.emit(Kind.Error, this.p + 1);
  }

  /** `:::name` is a tag, any other `:` a colon. */
  private colon(): void {
    const tag = this.tagAt();
    this.emit(tag > 0 ? BETA.Tag : BETA.Colon, tag > 0 ? tag : this.p + 1);
  }

  private comment(): void {
    const end = this.lineEnd(this.p);
    this.w.push(Kind.Comment, this.p, end);
    this.p = end;
  }

  /** The offset of the next line break, or the text's end. */
  private lineEnd(at: number): number {
    let i = at;
    while (i < this.src.length) {
      const c = this.src.charCodeAt(i);
      if (c === LF || c === CR) break;
      i++;
    }
    return i;
  }

  /** The end of text that runs to the line end or to a `%%`, whichever comes first. */
  private textEnd(at: number): number {
    const { src } = this;
    let i = at;
    while (i < src.length) {
      const c = src.charCodeAt(i);
      if (c === LF || c === CR || (c === PERCENT && src.charCodeAt(i + 1) === PERCENT)) break;
      i++;
    }
    return i;
  }

  /** `"…"` or `'…'`, `\` escaping the next character; unclosed, an error to the line end. */
  private string(quote: number): void {
    const { src } = this;
    let i = this.p + 1;
    for (; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === quote || c === LF || c === CR) break;
      if (c === BACKSLASH && isLineEnd(src.charCodeAt(i + 1))) break;
      if (c === BACKSLASH) i++;
    }
    if (src.charCodeAt(i) === quote) this.emit(BETA.String, i + 1);
    else this.emit(Kind.Error, i);
  }

  /** The end of `:::name` at the colon, or 0 when it is a plain `:`. */
  private tagAt(): number {
    const { src, p } = this;
    if (src.charCodeAt(p + 1) !== COLON || src.charCodeAt(p + 2) !== COLON) return 0;
    return isWord(src.charCodeAt(p + 3)) ? this.wordEnd(p + 3) : 0;
  }

  /** `#` and 3, 4, 6 or 8 hex digits that no word character follows. */
  private hex(): void {
    const { src, p } = this;
    let i = p + 1;
    while (isHex(src.charCodeAt(i))) i++;
    const ok = HEX_DIGITS.has(i - p - 1) && !isWord(src.charCodeAt(i));
    this.emit(ok ? BETA.Hex : Kind.Error, ok ? i : p + 1);
  }

  /**
   * The end of `rgb(…)`, `rgba(…)`, `hsl(…)` or `hsla(…)` whose name ends at `nameEnd`: its `)`
   * on the same line, with no `(`, `)` or `%%` before it; 0 when it is not one.
   */
  private colorFunctionEnd(nameEnd: number): number {
    const { src } = this;
    if (src.charCodeAt(nameEnd) !== LPAREN) return 0;
    for (let i = nameEnd + 1; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === RPAREN) return i + 1;
      if (c === LPAREN || c === LF || c === CR) return 0;
      if (c === PERCENT && src.charCodeAt(i + 1) === PERCENT) return 0;
    }
    return 0;
  }

  /** `-->`, `<--`, `<-->` and `---`; any other `-` or `<` is an error. */
  private arrow(): void {
    const { src, p } = this;
    const after = src.charCodeAt(p + UNDIRECTED.length);
    const hit =
      src.startsWith(UNDIRECTED, p) && after !== DASH && after !== GT
        ? ([UNDIRECTED, BETA.ArrowUndirected] as const)
        : ARROWS.find(([text]) => src.startsWith(text, p));
    this.emit(hit ? hit[1] : Kind.Error, this.p + (hit ? hit[0].length : 1));
  }

  /** The end of an id's words: letters, digits and `_` joined by single `-`. */
  private wordEnd(at: number): number {
    const { src } = this;
    let i = at;
    for (;;) {
      while (isWord(src.charCodeAt(i))) i++;
      if (src.charCodeAt(i) === DASH && isWord(src.charCodeAt(i + 1))) i++;
      else return i;
    }
  }

  private word(): void {
    const { src, p } = this;
    if (this.lineStart && isDigit(src.charCodeAt(p)) && this.step()) return;
    const end = this.wordEnd(p);
    const text = src.slice(p, end);
    const keyword = BETA_KEYWORDS.get(text);
    const call = COLOR_FUNCTIONS.has(text) ? this.colorFunctionEnd(end) : 0;
    if (call > 0) this.emit(BETA.ColorFunction, call);
    else if (text === 'title') this.emit(BETA.Title, this.textEnd(end));
    else if (text === ACC_TITLE) this.accTitle(end);
    else if (text === ACC_DESCR) this.accDescr(end);
    else this.emit(keyword ?? BETA.Id, end);
  }

  /** `2` before a `:`: the step of a relation. */
  private step(): boolean {
    const { src, p } = this;
    let i = p;
    while (isDigit(src.charCodeAt(i))) i++;
    let j = i;
    while (isBlank(src.charCodeAt(j))) j++;
    if (src.charCodeAt(j) !== COLON) return false;
    this.emit(BETA.Step, i);
    return true;
  }

  private blanksEnd(at: number, space: (c: number) => boolean): number {
    let i = at;
    while (i < this.src.length && space(this.src.charCodeAt(i))) i++;
    return i;
  }

  /** `accTitle` and its `:`; without the `:` the word is an error. */
  private accTitle(wordEnd: number): void {
    const colon = this.blanksEnd(wordEnd, isBlank);
    if (this.src.charCodeAt(colon) === COLON) this.emit(BETA.AccTitle, this.textEnd(colon + 1));
    else this.emit(Kind.Error, wordEnd);
  }

  /** `accDescr:` and the line, or `accDescr {` to its `}`; else an error. */
  private accDescr(wordEnd: number): void {
    const { src } = this;
    const colon = this.blanksEnd(wordEnd, isBlank);
    if (src.charCodeAt(colon) === COLON) {
      this.emit(BETA.AccDescr, this.textEnd(colon + 1));
      return;
    }
    const brace = this.blanksEnd(wordEnd, isSpace);
    if (src.charCodeAt(brace) !== LBRACE) this.emit(Kind.Error, wordEnd);
    else {
      const close = brace >= this.noBraceFrom ? -1 : src.indexOf('}', brace);
      if (close < 0) this.noBraceFrom = Math.min(this.noBraceFrom, brace);
      this.emit(
        close < 0 ? Kind.Error : BETA.AccDescr,
        close < 0 ? this.lineEnd(brace) : close + 1
      );
    }
  }
}
