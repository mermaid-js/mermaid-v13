/**
 * Journey lexer: a state machine mirroring the start conditions and rule order of v12's
 * `journey.jison` (parser-method §1), modelled on the sequence lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `%…`, `x%%…` and `#…` comments the jison lexer skipped.
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); `journey` ends in `\b` (ASCII word characters); `\n`
 * in a rule is LF only, while `\s` takes every line terminator. Every rule matches somewhere,
 * so jison never throws on journey text: a `;` is its `INVALID` token. Every scan is linear in
 * the text it consumes (R-PARSE-7).
 */
// cspell:words acctitle accdescr
import {
  COLON,
  CR,
  firstHole,
  HASH,
  isSpace,
  Kind,
  LBRACE,
  LF,
  localOffset,
  PERCENT,
  RBRACE,
  SEMI,
  SourceOffsets,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of journey.jison (all exclusive).
const S = {
  INITIAL: 0,
  acc_title: 1,
  acc_descr: 2,
  acc_descr_multiline: 3,
} as const;

/** Start condition names by number, for the probe's lexer mode. */
const S_NAMES: readonly string[] = ['INITIAL', 'acc_title', 'acc_descr', 'acc_descr_multiline'];

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** A regex `\w` without the `u` flag: `[A-Za-z0-9_]` (what jison's `\b` reads). */
const isAsciiWord = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

/** Not in `[^#\n;]` (`title`, `taskData`). */
const isLineStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** Not in `[^#:\n;]` (`section`, `taskName`). */
const isNameStop = (c: number) => isLineStop(c) || c === COLON;

const LOWER_A = 0x61;
const LOWER_J = 0x6a;
const LOWER_S = 0x73;
const LOWER_T = 0x74;

/**
 * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
 * CR into LF before lexing, so every CR reads as LF (a CRLF as two, which every rule treats as
 * one run except a single `\s` and the character before `%%`, where the lexer steps over the
 * pair); each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#` or `;` (v12's
 * placeholders).
 */
function lexerText(text: string): string {
  let out = text.includes('\r') ? text.replace(/\r/g, '\n') : text;
  if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
  return out;
}

/**
 * Lex the journey body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new JourneyLexer(src, from, view).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class JourneyLexer {
  /** The text v12 lexed, plus the line break v12 appended (clamped in the output). */
  private readonly text: string;
  /** The view's text: CRs as written (see {@link lexerText}). */
  private readonly raw: string;
  /** Length of v12's text without the appended line break. */
  private readonly len: number;
  private readonly n: number;
  private readonly offsets: SourceOffsets | undefined;
  private readonly holes: readonly Hole[];
  /** The next removed span to write as trivia. */
  private hole: number;
  private readonly w: TokenWriter;
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p: number;

  constructor(
    private readonly src: string,
    from: number,
    view: SourceView
  ) {
    const lexText = lexerText(view.text);
    this.text = lexText + '\n';
    this.len = lexText.length;
    this.raw = view.text;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    // About one token per eight characters of journey text.
    this.w = new TokenWriter(((this.len - this.p) >> 3) + 8);
  }

  run(probe?: Probe): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) while (this.p < n) this.step(text.charCodeAt(this.p));
    else {
      while (this.p < n) {
        const before = this.p;
        const mode = S_NAMES[this.state] ?? '';
        this.step(text.charCodeAt(this.p));
        probe.lexed(this.source(before), this.source(this.p), mode);
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
    // At the end jison tries the rules once more on the empty input: an accessibility state's
    // value rule matches it (empty), INITIAL's `<<EOF>>` does. jison then returns `$end`
    // without trying `<<EOF>>`, but v13 always ends in `EOF` (a gate exclusion).
    const kind = this.endKind();
    if (kind !== T.Eof) this.emit(kind, this.len, this.len);
    this.emit(T.Eof, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The token the current state's rules give on the empty input at the end. */
  private endKind(): number {
    switch (this.state) {
      case S.acc_title:
        return T.AccTitleValue;
      case S.acc_descr:
        return T.AccDescrValue;
      case S.acc_descr_multiline:
        return T.AccDescrMultilineValue;
      default:
        return T.Eof;
    }
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

  /**
   * Write the token `text[s, end)` with its source range, and move to `next` (default `end`):
   * the `accDescr {` opener ends before the blanks it consumed.
   */
  private emit(kind: number, s: number, end: number, next: number = end): true {
    let a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    // A line break starts at the CR of its CRLF.
    if (b > a && this.src.charCodeAt(a) === LF && this.src.charCodeAt(a - 1) === CR) a--;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    this.p = next;
    return true;
  }

  /** The end of the `;` v12 dropped at `b`, which belongs to the token before it; else `b`. */
  private dropAt(b: number): number {
    const hs = this.holes;
    let k = this.hole;
    while (k < hs.length && (hs[k]?.start ?? b) < b) k++;
    const h = hs[k];
    return h && h.start === b && h.kind === 'drop' ? h.end : b;
  }

  private push(s: number): void {
    this.stack.push(this.state);
    this.state = s;
  }

  private pop(): void {
    this.state = this.stack.pop() ?? S.INITIAL;
  }

  // --- Scans --------------------------------------------------------------------------------

  /** The first LF at or after `q` (jison `[^\n]*` ends there), else the end. */
  private lineEnd(q: number): number {
    const e = this.text.indexOf('\n', q);
    return e === -1 ? this.n : e;
  }

  /** The end of the run of `\s` from `q`. */
  private blanks(q: number): number {
    let j = q;
    while (j < this.n && isSpace(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** The end of the run of characters `stop` rejects, from `q`. */
  private runOf(q: number, stop: (c: number) => boolean): number {
    let j = q;
    while (j < this.n && !stop(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** `q` plus the width of one v12 character there: a CRLF was one LF. */
  private oneChar(q: number): number {
    return q + (this.raw.charCodeAt(q) === CR && this.raw.charCodeAt(q + 1) === LF ? 2 : 1);
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  private literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): void {
    switch (this.state) {
      case S.INITIAL:
        this.initial(c);
        return;
      case S.acc_title:
      case S.acc_descr:
        this.accValue();
        return;
      default:
        this.accDescrMultiline(c);
    }
  }

  /** The INITIAL rules in file order. One always matches (`.` takes what the others leave). */
  private initial(c: number): true {
    const { text, p } = this;
    // `\%%(?!\{)[^\n]*`, which jison reads as `%(?!\{)[^\n]*`: one `%` will do.
    if (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE)
      return this.emit(Kind.Comment, p, this.lineEnd(p));
    // `[^\}]%%[^\n]*`: takes the character before the `%%`, a line break included.
    if (c !== RBRACE) {
      const q = this.oneChar(p);
      if (text.charCodeAt(q) === PERCENT && text.charCodeAt(q + 1) === PERCENT)
        return this.emit(Kind.Comment, p, this.lineEnd(q));
    }
    // `[\n]+`
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      return this.emit(Kind.Newline, p, e);
    }
    // `\s+`: skipped, line breaks after a blank included.
    if (isSpace(c)) {
      this.p = this.blanks(p);
      return true;
    }
    // `#[^\n]*`
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    const l = lower(c);
    if (l === LOWER_J && this.literal('journey', p) && !isAsciiWord(text.charCodeAt(p + 7)))
      return this.emit(T.Journey, p, p + 7);
    if (l === LOWER_T && this.keywordLine('title', T.Title, isLineStop)) return true;
    if (l === LOWER_A && this.acc()) return true;
    if (l === LOWER_S && this.keywordLine('section', T.Section, isNameStop)) return true;
    // `[^#:\n;]+`
    if (!isNameStop(c)) return this.emit(T.TaskName, p, this.runOf(p, isNameStop));
    // `:[^#\n;]+`, then `:`
    if (c === COLON) {
      const e = this.runOf(p + 1, isLineStop);
      return e > p + 1 ? this.emit(T.TaskData, p, e) : this.emit(T.Colon, p, p + 1);
    }
    // `.`: one code unit (`;`; `#` and line breaks were taken above).
    return this.emit(T.Invalid, p, p + 1);
  }

  /**
   * `title\s[^#\n;]+` and `section\s[^#:\n;]+`: the keyword, one `\s` (a line break too), and
   * at least one character `stop` rejects, all one token.
   */
  private keywordLine(word: string, kind: number, stop: (c: number) => boolean): boolean {
    const { p } = this;
    const q = p + word.length;
    if (!this.literal(word, p) || !isSpace(this.text.charCodeAt(q))) return false;
    const after = this.oneChar(q);
    const e = this.runOf(after, stop);
    if (e === after) return false;
    return this.emit(kind, p, e);
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(): boolean {
    const { text, p } = this;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.blanks(p + 8);
    const d = text.charCodeAt(j);
    if (d === COLON) {
      this.emit(title ? T.AccTitle : T.AccDescr, p, this.blanks(j + 1));
      this.push(title ? S.acc_title : S.acc_descr);
      return true;
    }
    if (title || d !== LBRACE) return false;
    this.emit(T.AccDescrMultiline, p, j + 1, this.blanks(j + 1));
    this.push(S.acc_descr_multiline);
    return true;
  }

  /** `(?!\n|;|#)*[^\n]*` (the quantified lookahead matches empty): the acc title or description. */
  private accValue(): void {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.pop();
    this.emit(kind, this.p, this.lineEnd(this.p));
  }

  /** `[\}]` (pops, no jison token) and `[^\}]*`. */
  private accDescrMultiline(c: number): void {
    const { text, p } = this;
    if (c === RBRACE) {
      this.pop();
      this.emit(T.AccDescrMultilineEnd, p, p + 1);
      return;
    }
    const e = text.indexOf('}', p);
    this.emit(T.AccDescrMultilineValue, p, e === -1 ? this.n : e);
  }
}
