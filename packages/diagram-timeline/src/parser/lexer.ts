/**
 * Timeline lexer: a state machine mirroring the start conditions and rule order of v12's
 * `timeline.jison` (parser-method §1), modelled on the sequence lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `#…`, `%…` and `x%%…` comments the jison lexer skipped, and a dropped `;` that no
 *   token took (`Space`).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); the `timeline` keywords end in `\b`; the first rule,
 * written `\%%(?!\{)`, compiles to a single `%`; `\n` in a rule is LF only, while `\s` takes
 * every line terminator, so a bare `title` or `section` takes the next line. jison never throws
 * on timeline text: `\s+` and the last rule `.` take every character between them. Every scan
 * is linear in the text it consumes (R-PARSE-7).
 */
// cspell:words acctitle accdescr
import {
  COLON,
  CR,
  firstHole,
  HASH,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  localOffset,
  PERCENT,
  RBRACE,
  SourceOffsets,
  TAB,
  SPACE,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, SourceView, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';

// Start conditions of timeline.jison.
const S = {
  INITIAL: 0,
  acc_title: 1,
  acc_descr: 2,
  acc_descr_multiline: 3,
} as const;

/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const S_NAMES = ['INITIAL', 'acc_title', 'acc_descr', 'acc_descr_multiline'];

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

const LOWER_A = 0x61;
const LOWER_S = 0x73;
const LOWER_T = 0x74;

/**
 * The text the lexer reads, of the same length as the view's text: v12 turned every CRLF and
 * CR into LF before lexing, so a CRLF reads as two LFs (every rule treats a run of line breaks
 * as one, except a single `\s` or a `[^\}]`, which the lexer steps over as a pair) and a lone
 * CR as LF; each `#name;` entity is `ﬂ`, the name and `¶`, so no rule takes its `#` (v12's
 * placeholders).
 */
function lexerText(text: string): string {
  let out = text.includes('\r')
    ? text.replace(/\r\n?/g, (m) => (m.length === 2 ? '\n\n' : '\n'))
    : text;
  if (out.includes('#')) out = out.replace(/#(\w+);/g, (_, name: string) => `ﬂ${name}¶`);
  return out;
}

/**
 * Lex the timeline body `src[from…]`. `view` comes from {@link sourceView}. With a `probe`, the
 * start condition at the probe's offset is recorded as its mode.
 */
export function lex(src: string, from: number, view: SourceView, probe?: Probe): TokenStream {
  return new TimelineLexer(src, from, view).run(probe);
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class TimelineLexer {
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
  /** The end of the last token's source range (dropped `;` before it belong to a token). */
  private covered = 0;
  private readonly w: TokenWriter;
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private p: number;
  /** Source offset where the last `acc…` keyword's value mode starts (after `:` or `{`). */
  private valueAt = 0;

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
    // About one token per eight characters of timeline text.
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
        const before = this.source(this.p);
        const state = this.state;
        const depth = this.stack.length;
        this.step(text.charCodeAt(this.p));
        const after = this.source(this.p);
        if (this.stack.length > depth) {
          // An `acc…` keyword: after its `:` or `{` (the blanks it took too) the value starts.
          probe.lexed(before, this.valueAt, S_NAMES[state] ?? '');
          probe.lexed(this.valueAt, after, S_NAMES[this.state] ?? '');
        } else {
          // A one-line value holds the offset at its end too (typing there extends it).
          const value = state === S.acc_title || state === S.acc_descr ? 1 : 0;
          probe.lexed(before, after + value, S_NAMES[state] ?? '');
        }
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
    // At the end jison tries the rules once more on the empty input.
    this.emit(this.endKind(), this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The token a rule matching the empty input at the end gives in the current state. */
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

  /**
   * Write the token `text[s, end)` with its source range, and move to `next` (default `end`):
   * the `accDescr {` opener ends before the blanks it consumed.
   */
  private emit(kind: number, s: number, end: number, next: number = end): void {
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
    if (b > this.covered) this.covered = b;
    this.p = next;
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

  /**
   * The end of the one character v12 saw at `q`: a CRLF in the source is one LF to v12. A CR and
   * an LF that a removed span left side by side are two: v12 turned CRs into LFs first.
   */
  private charEnd(q: number): number {
    if (this.raw.charCodeAt(q) !== CR || this.raw.charCodeAt(q + 1) !== LF) return q + 1;
    const o = this.offsets;
    return !o || o.source(q + 1) === o.source(q) + 1 ? q + 2 : q + 1;
  }

  /** The end of one `\s` at `q`, or -1. */
  private space(q: number): number {
    return isSpace(this.text.charCodeAt(q)) ? this.charEnd(q) : -1;
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

  private initial(c: number): void {
    const { text, p } = this;
    // `%(?!\{)[^\n]*` and `[^\}]%%[^\n]*`: comments (the second may start with a line break).
    if (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE) {
      this.emit(Kind.Comment, p, this.lineEnd(p));
      return;
    }
    const q = this.charEnd(p);
    if (c !== RBRACE && text.charCodeAt(q) === PERCENT && text.charCodeAt(q + 1) === PERCENT) {
      this.emit(Kind.Comment, p, this.lineEnd(q));
      return;
    }
    // `[\n]+` and `\s+`.
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      this.emit(Kind.Newline, p, e);
      return;
    }
    if (isSpace(c)) {
      this.p = this.blanks(p);
      return;
    }
    // `#[^\n]*`.
    if (c === HASH) {
      this.emit(Kind.Comment, p, this.lineEnd(p));
      return;
    }
    const l = lower(c);
    if (l === LOWER_T && (this.header() || this.title())) return;
    if (l === LOWER_A && this.acc()) return;
    if (l === LOWER_S && this.section()) return;
    if (c === COLON) {
      if (!this.event()) this.emit(T.Invalid, p, p + 1);
      return;
    }
    // `[^#:\n]+` (the text starts with neither, and line terminators were taken by `\s+`).
    let e = p + 1;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === HASH || d === COLON || d === LF) break;
      e++;
    }
    this.emit(T.Period, p, e);
  }

  /** `timeline[ \t]+LR\b`, `timeline[ \t]+TD\b` and `timeline\b`. */
  private header(): boolean {
    const { text, p } = this;
    if (!this.literal('timeline', p)) return false;
    const e = p + 8;
    let j = e;
    while (text.charCodeAt(j) === SPACE || text.charCodeAt(j) === TAB) j++;
    if (
      j > e &&
      (this.literal('lr', j) || this.literal('td', j)) &&
      !isWord(text.charCodeAt(j + 2))
    ) {
      this.emit(lower(text.charCodeAt(j)) === 0x6c ? T.TimelineLR : T.TimelineTD, p, j + 2);
      return true;
    }
    if (isWord(text.charCodeAt(e))) return false;
    this.emit(T.Timeline, p, e);
    return true;
  }

  /** `title\s[^\n]+`. */
  private title(): boolean {
    if (!this.literal('title', this.p)) return false;
    const after = this.space(this.p + 5);
    if (after === -1) return false;
    const e = this.lineEnd(after);
    if (e === after) return false;
    this.emit(T.Title, this.p, e);
    return true;
  }

  /** `section\s[^:\n]+`. */
  private section(): boolean {
    const { text, p } = this;
    if (!this.literal('section', p)) return false;
    const after = this.space(p + 7);
    if (after === -1) return false;
    let e = after;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === COLON || d === LF) break;
      e++;
    }
    if (e === after) return false;
    this.emit(T.Section, p, e);
    return true;
  }

  /** `:\s(?:[^:\n]|:(?!\s))+`. */
  private event(): boolean {
    const { text, p } = this;
    const after = this.space(p + 1);
    if (after === -1) return false;
    let e = after;
    while (e < this.n) {
      const d = text.charCodeAt(e);
      if (d === LF || (d === COLON && isSpace(text.charCodeAt(e + 1)))) break;
      e++;
    }
    if (e === after) return false;
    this.emit(T.Event, p, e);
    return true;
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(): boolean {
    const { text, p } = this;
    const title = this.literal('acctitle', p);
    if (!title && !this.literal('accdescr', p)) return false;
    const j = this.blanks(p + 8);
    const d = text.charCodeAt(j);
    this.valueAt = this.source(j + 1);
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

  /** `(?!\n|;|#)*[^\n]*`: the lookahead is optional, so `[^\n]*` (title or one-line description). */
  private accValue(): void {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.pop();
    this.emit(kind, this.p, this.lineEnd(this.p));
  }

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
