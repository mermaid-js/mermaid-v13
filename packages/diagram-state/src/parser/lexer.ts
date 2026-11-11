/**
 * State lexer: a state machine mirroring the start conditions of v12's `stateDiagram.jison`
 * (DESIGN §4.3, parser-method §1), checked token by token against it (#138). It lexes the text
 * v12 lexed ({@link stateView}) and maps every token back to its source range; the source is
 * never rewritten.
 *
 * jison's matching, reproduced: per start condition the first rule that matches wins (no
 * longest match); every rule is case-insensitive; literals ending in a word character carry a
 * trailing `\b`; at the end of the text one more match is tried (rules that match the empty
 * string fire there once). Where v12's lexer threw, an `Error` token is written and lexing
 * goes on (for recovery). Comments are trivia tokens; blanks are not tokens.
 *
 * Every scan is linear in the text it consumes (R-PARSE-7): searches that look ahead along a
 * line (`.*direction…`, `.*<<fork>>`, `end note`) keep the next match found as a memo.
 */
import {
  codePointEnd,
  COLON,
  COMMA,
  CR,
  DASH,
  DQUOTE,
  HASH,
  isDigit,
  isLineEnd,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  PERCENT,
  RBRACE,
  RBRACKET,
  SEMI,
  SPACE,
  TAB,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { Probe, TokenStream } from '@mermaid-js/core/parser-kit';
import type { StateView } from './view.ts';
import { T } from './tokens.ts';

// Start conditions of stateDiagram.jison (those some rule enters).
const S = {
  INITIAL: 0,
  struct: 1,
  STATE: 2,
  STATE_STRING: 3,
  STATE_ID: 4,
  SCALE: 5,
  acc_title: 6,
  acc_descr: 7,
  acc_descr_multiline: 8,
  CLASSDEF: 9,
  CLASSDEFID: 10,
  CLASS: 11,
  CLASS_STYLE: 12,
  STYLE: 13,
  STYLEDEF_STYLES: 14,
  NOTE: 15,
  NOTE_ID: 16,
  NOTE_TEXT: 17,
  FLOATING_NOTE: 18,
  FLOATING_NOTE_ID: 19,
} as const;
/** Start condition names by number, for the probe's lexer mode (R-LANG-7). */
const S_NAMES = /* @__PURE__ */ Object.keys(S);

// Literal rules (case-insensitive, as `%options case-insensitive` compiles them).
const RE_CLICK = /click\b/iy;
const RE_HREF = /href\b/iy;
const RE_DEFAULT = /default\b/iy;
const RE_SCALE = /scale\s+/iy;
const RE_WIDTH = /\s+width\b/iy;
const RE_ACC_TITLE = /accTitle\s*:\s*/iy;
const RE_ACC_DESCR = /accDescr\s*:\s*/iy;
const RE_ACC_DESCR_ML = /accDescr\s*\{\s*/iy;
const RE_CLASSDEF = /classDef\s+/iy;
const RE_CLASS = /class\s+/iy;
const RE_STYLE = /style\s+/iy;
const RE_STATE = /state\s+/iy;
const RE_NOTE = /note\s+/iy;
const RE_SD = /stateDiagram\s+/iy;
const RE_SD2 = /stateDiagram-v2\s+/iy;
const RE_HIDE = /hide empty description\b/iy;
const RE_DEFAULT_ID = /default\s+/iy;
const RE_WORD_SPACE = /\w+\s+/y;
const RE_IDS_SPACE = /[\w,]+\s+/y;
const RE_AS = /\s*as\s+/iy;
const RE_FLOATING_AS = /\s*as\s*/iy;
const RE_LEFT_OF = /left of\b/iy;
const RE_RIGHT_OF = /right of\b/iy;

/** States whose one rule is `[^\n]*` (pop, return the value), with the value's kind. */
const LINE_VALUES: Readonly<Record<number, number>> = {
  [S.acc_title]: T.AccTitleValue,
  [S.acc_descr]: T.AccDescrValue,
  [S.CLASSDEFID]: T.ClassDefStyleOpts,
  [S.CLASS_STYLE]: T.StyleClass,
  [S.STYLEDEF_STYLES]: T.StyleDefStyleOpts,
};

const DIRECTIONS = ['tb', 'bt', 'rl', 'lr'];
const DIRECTION_KINDS = [T.DirectionTB, T.DirectionBT, T.DirectionRL, T.DirectionLR];
const MARKERS = ['<<fork>>', '<<join>>', '<<choice>>', '[[fork]]', '[[join]]', '[[choice]]'];
const MARKER_KINDS = [T.Fork, T.Join, T.Choice, T.Fork, T.Join, T.Choice];

/** Tokens of the view, with each token's range in the view text too (for its image). */
export interface Lexed {
  tokens: TokenStream;
  /** View offsets of each token; trivia tokens have `NO_VIEW`. */
  viewStart: Uint32Array;
  viewEnd: Uint32Array;
}

export const NO_VIEW = 0xffffffff;

/** A blank within a line. */
const isBlank = (c: number): boolean => c === SPACE || c === TAB;
const LOWER_M = 0x6d;

/**
 * Lex the state source `src` whose v12 text is `view`. With a `probe`, the start condition at
 * the probe's offset is recorded as its mode.
 */
export function lex(src: string, view: StateView, probe?: Probe): Lexed {
  return new StateLexer(src, view).run(probe);
}

class StateLexer {
  private readonly t: string;
  /** `t` with ASCII letters lower-cased (same length), for case-insensitive searches. */
  private readonly lower: string;
  private readonly n: number;
  private readonly w = new TokenWriter(64);
  private readonly vs: number[] = [];
  private readonly ve: number[] = [];
  private readonly stack: number[] = [S.INITIAL];
  private state: number = S.INITIAL;
  private p = 0;
  private removed = 0;
  // Memos that keep the look-ahead scans linear.
  private lineEndAt = -1;
  private readonly directionAt = [-1, -1, -1, -1];
  private readonly markerAt = [-1, -1, -1, -1, -1, -1];
  private noEndNoteFrom = -1;
  private braceAt = -1;
  private quoteAt = -1;
  private percentAt = -1;

  constructor(
    private readonly src: string,
    private readonly view: StateView
  ) {
    this.t = view.text;
    this.n = view.text.length;
    this.lower = view.text.replace(/[A-Z]+/g, (s) => s.toLowerCase());
  }

  run(probe?: Probe): Lexed {
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) while (this.p < this.n) this.step();
    else this.probedSteps(probe);
    this.atEnd();
    this.flushRemoved(this.src.length + 1);
    return {
      tokens: this.w.finish(this.src),
      viewStart: Uint32Array.from(this.vs),
      viewEnd: Uint32Array.from(this.ve),
    };
  }

  /** The steps, telling `probe` the start condition each one reads its text in. */
  private probedSteps(probe: Probe): void {
    while (this.p < this.n) {
      const before = this.p;
      const mode = S_NAMES[this.state] ?? '';
      this.step();
      probe.lexed(this.sourceStart(before), this.sourceStart(this.p), mode);
    }
    probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
  }

  // --- output ---

  private sourceStart(a: number): number {
    return this.view.at[a] ?? this.src.length;
  }

  private sourceEnd(a: number, b: number): number {
    if (b <= a) return this.sourceStart(a);
    const s = this.view.at[b - 1] ?? this.src.length;
    if (s >= this.src.length) return this.src.length;
    // A line break that was CRLF in the source ends after the LF.
    return s + (this.src.charCodeAt(s) === CR && this.src.charCodeAt(s + 1) === LF ? 2 : 1);
  }

  /** Write removed spans (comment lines, directives) that start before `at` as trivia. */
  private flushRemoved(at: number): void {
    const r = this.view.removed;
    while (this.removed < r.length && (r[this.removed]?.start ?? 0) < at) {
      const h = r[this.removed++];
      if (!h) break;
      this.w.push(h.kind === 'comment' ? Kind.Comment : Kind.Directive, h.start, h.end);
      this.vs.push(NO_VIEW);
      this.ve.push(NO_VIEW);
    }
  }

  private emit(kind: number, a: number, b: number): void {
    const start = this.sourceStart(a);
    this.flushRemoved(start);
    this.w.push(kind, start, Math.max(start, this.sourceEnd(a, b)));
    this.vs.push(a);
    this.ve.push(b);
  }

  /** Write `[a, b)` trimmed of blanks (jison's `yytext.trim()`). */
  private emitTrimmed(kind: number, a: number, b: number): void {
    let x = a;
    let y = b;
    while (x < y && isSpace(this.code(x))) x++;
    while (y > x && isSpace(this.code(y - 1))) y--;
    this.emit(kind, x, y);
  }

  private push(state: number): void {
    this.stack.push(state);
    this.state = state;
  }

  private pop(): void {
    if (this.stack.length > 1) this.stack.pop();
    this.state = this.stack[this.stack.length - 1] ?? S.INITIAL;
  }

  // --- scanning helpers ---

  private code(i: number): number {
    return this.t.charCodeAt(i);
  }

  /** End of a sticky case-insensitive literal rule at `p`, or -1. */
  private match(re: RegExp): number {
    re.lastIndex = this.p;
    return re.test(this.t) ? re.lastIndex : -1;
  }

  /**
   * The first offset at or after `from` (default `p`) that regex `.` does not match. The last
   * answer stays valid for any `from` up to it.
   */
  private lineEnd(from = this.p): number {
    if (this.lineEndAt < from) {
      let i = from;
      while (i < this.n && !isLineEnd(this.code(i))) i++;
      this.lineEndAt = i;
    }
    return this.lineEndAt;
  }

  /** The next `\n` at or after `i` (the view always ends in one). */
  private nextLf(i: number): number {
    const k = this.t.indexOf('\n', i);
    return k < 0 ? this.n : k;
  }

  /** End of the entity `#name;` at `i`, or -1. v12 lexed it as one opaque placeholder. */
  private entityEnd(i: number): number {
    if (this.code(i) !== HASH) return -1;
    let j = i + 1;
    while (isWord(this.code(j))) j++;
    return j > i + 1 && this.code(j) === SEMI ? j + 1 : -1;
  }

  /**
   * After `i`, the end of one unit of `[^:\n;]` (an entity counts as one), or -1. The
   * `;` of an entity is not a stop: in v12's text it was a placeholder character.
   */
  private textUnit(i: number): number {
    const c = this.code(i);
    if (i >= this.n || c === COLON || c === LF || c === SEMI) return -1;
    const e = this.entityEnd(i);
    return e < 0 ? i + 1 : e;
  }

  /** `#…` and `%%(?!{)…` comments: the end of the comment at `p`, or -1. */
  private comment(): number {
    const c = this.code(this.p);
    const isHash = c === HASH && this.entityEnd(this.p) < 0;
    const isPercent =
      c === PERCENT && this.code(this.p + 1) === PERCENT && this.code(this.p + 2) !== LBRACE;
    return isHash || isPercent ? this.nextLf(this.p) : -1;
  }

  /** `<cond>((?!\n)\s)+`: the end of same-line blanks at `p`, or -1. */
  private blanks(): number {
    let i = this.p;
    while (i < this.n && this.code(i) !== LF && isSpace(this.code(i))) i++;
    return i > this.p ? i : -1;
  }

  /**
   * jison's `processId`: an id holding `%%` ends before it, and the rest is lexed again; an id
   * that starts with `%%` is dropped. Returns false when dropped.
   */
  private processId(kind: number, a: number, b: number): boolean {
    if (this.percentAt !== -2 && this.percentAt < a) {
      const at = this.t.indexOf('%%', a);
      this.percentAt = at < 0 ? -2 : at;
    }
    const k = this.percentAt;
    if (k === a && b > a) {
      this.p = b;
      return false;
    }
    const end = k >= 0 && k < b ? k : b;
    this.emit(kind, a, end);
    this.p = end;
    return true;
  }

  /** `.*direction\s+XX[^\n]*` (XX in rule order): `[kind, end]` at `p`, or undefined. */
  private direction(): [number, number] | undefined {
    const le = this.lineEnd();
    for (let d = 0; d < 4; d++) {
      let q = this.nextDirection(d, this.p);
      if (q < 0 || q >= le) continue;
      // `.*` is greedy: the last one on the line.
      for (let r = this.nextDirection(d, q + 1); r >= 0 && r < le; r = this.nextDirection(d, r + 1))
        q = r;
      let i = q + 9;
      while (isSpace(this.code(i))) i++;
      return [DIRECTION_KINDS[d] ?? T.DirectionTB, this.nextLf(i + 2)];
    }
    return undefined;
  }

  /** The first `direction\s+XX` (XX = `DIRECTIONS[d]`) at or after `from`, or -1. */
  private nextDirection(d: number, from: number): number {
    const memo = this.directionAt[d] ?? -1;
    if (memo === -2 || memo >= from) return memo === -2 ? -1 : memo;
    const xx = DIRECTIONS[d] ?? '';
    for (
      let k = this.lower.indexOf('direction', from);
      k >= 0;
      k = this.lower.indexOf('direction', k + 1)
    ) {
      let i = k + 9;
      if (!isSpace(this.code(i))) continue;
      while (isSpace(this.code(i))) i++;
      if (this.lower.startsWith(xx, i)) {
        this.directionAt[d] = k;
        return k;
      }
    }
    this.directionAt[d] = -2;
    return -1;
  }

  /** The first `MARKERS[m]` at or after `from`, or -1. */
  private nextMarker(m: number, from: number): number {
    const memo = this.markerAt[m] ?? -1;
    if (memo === -2 || memo >= from) return memo === -2 ? -1 : memo;
    const k = this.lower.indexOf(MARKERS[m] ?? '', from);
    this.markerAt[m] = k < 0 ? -2 : k;
    return k;
  }

  // --- rules per start condition ---

  private step(): void {
    switch (this.state) {
      case S.INITIAL:
        return this.initial();
      case S.struct:
        return this.struct();
      case S.STATE:
        return this.stateRules();
      default:
        return this.leaf();
    }
  }

  /** No rule matched: an error. In a value state, leave it; else skip one character. */
  private error(): void {
    if (this.state !== S.INITIAL && this.state !== S.struct && this.state !== S.STATE) {
      this.emit(Kind.Error, this.p, this.p);
      this.pop();
      return;
    }
    const end = codePointEnd(this.t, this.p);
    this.emit(Kind.Error, this.p, end);
    this.p = end;
  }

  private token(kind: number, end: number): void {
    this.emit(kind, this.p, end);
    this.p = end;
  }

  /** Rules shared by INITIAL and struct, in their order: `classDef` … `state`. */
  private statements(): boolean {
    let e: number;
    if ((e = this.match(RE_CLASSDEF)) >= 0) {
      this.token(T.ClassDef, e);
      this.push(S.CLASSDEF);
    } else if ((e = this.match(RE_CLASS)) >= 0) {
      this.token(T.Class, e);
      this.push(S.CLASS);
    } else if ((e = this.match(RE_STYLE)) >= 0) {
      this.token(T.Style, e);
      this.push(S.STYLE);
    } else return false;
    return true;
  }

  private stateKeyword(): boolean {
    const e = this.match(RE_STATE);
    if (e < 0) return false;
    this.token(T.State, e);
    this.push(S.STATE);
    return true;
  }

  private note(): boolean {
    const e = this.match(RE_NOTE);
    if (e < 0) return false;
    this.token(T.Note, e);
    this.push(S.NOTE);
    return true;
  }

  /** `[*]`, the id, the description, `-->`, (`--` in struct), `:::`, in that order. */
  private edges(inStruct: boolean): boolean {
    const p = this.p;
    const c = this.code(p);
    if (this.t.startsWith('[*]', p)) {
      this.token(T.EdgeState, p + 3);
      return true;
    }
    let i = p;
    while (i < this.n) {
      const x = this.code(i);
      if (x === COLON || x === LF || x === DASH || x === LBRACE || isSpace(x)) break;
      i++;
    }
    if (i > p) {
      this.processId(T.Id, p, i);
      return true;
    }
    const e = this.descr();
    if (e >= 0) {
      this.emitTrimmed(T.Descr, p, e);
      this.p = e;
      return true;
    }
    if (c === DASH && this.t.startsWith('-->', p)) this.token(T.Arrow, p + 3);
    else if (inStruct && c === DASH && this.code(p + 1) === DASH) this.token(T.Concurrent, p + 2);
    else if (this.t.startsWith(':::', p)) this.token(T.StyleSeparator, p + 3);
    else return false;
    return true;
  }

  /** `\s*:(?:[^:\n;]|:[^:\n;])+`: its end at `p`, or -1. */
  private descr(): number {
    let i = this.p;
    while (isSpace(this.code(i))) i++;
    if (this.code(i) !== COLON) return -1;
    i++;
    let units = 0;
    for (;;) {
      let e = this.textUnit(i);
      if (e < 0 && this.code(i) === COLON) {
        e = this.textUnit(i + 1);
      }
      if (e < 0) break;
      i = e;
      units++;
    }
    return units > 0 ? i : -1;
  }

  /** INITIAL's first rules: `click`, `href`, a string, `default`, the `direction` lines. */
  private initialHead(): boolean {
    const p = this.p;
    let e: number;
    if ((e = this.match(RE_CLICK)) >= 0) this.token(T.Click, e);
    else if ((e = this.match(RE_HREF)) >= 0) this.token(T.Href, e);
    else if ((e = this.string()) >= 0) this.token(T.String, e);
    else if ((e = this.match(RE_DEFAULT)) >= 0) this.token(T.Default, e);
    else {
      const dir = this.direction();
      if (!dir) return false;
      this.token(dir[0], dir[1]);
    }
    return this.p > p;
  }

  /** `"[^"]*"`: its end at `p`, or -1. */
  private string(): number {
    const p = this.p;
    if (this.code(p) !== DQUOTE) return -1;
    if (this.quoteAt !== -2 && this.quoteAt <= p) {
      const k = this.t.indexOf('"', p + 1);
      this.quoteAt = k < 0 ? -2 : k;
    }
    return this.quoteAt >= 0 ? this.quoteAt + 1 : -1;
  }

  private initial(): void {
    const p = this.p;
    const c = this.code(p);
    let e: number;
    if (c === LOWER_M && this.embed()) return;
    if (this.initialHead()) return;
    if (c === LF) {
      let i = p;
      while (this.code(i) === LF) i++;
      return this.token(Kind.Newline, i);
    }
    if (isSpace(c)) {
      let i = p;
      while (isSpace(this.code(i))) i++;
      this.p = i;
      return;
    }
    if ((e = this.comment()) >= 0) return this.token(Kind.Comment, e);
    if ((e = this.match(RE_SCALE)) >= 0) {
      this.token(T.Scale, e);
      return this.push(S.SCALE);
    }
    if ((e = this.match(RE_ACC_TITLE)) >= 0) {
      this.token(T.AccTitle, e);
      return this.push(S.acc_title);
    }
    if ((e = this.match(RE_ACC_DESCR)) >= 0) {
      this.token(T.AccDescr, e);
      return this.push(S.acc_descr);
    }
    if ((e = this.match(RE_ACC_DESCR_ML)) >= 0) {
      this.token(T.AccDescrOpen, e);
      return this.push(S.acc_descr_multiline);
    }
    if (this.statements() || this.stateKeyword()) return;
    if (c === LBRACE) {
      this.token(T.StructStart, p + 1);
      this.pop();
      return this.push(S.struct);
    }
    if (this.note()) return;
    if ((e = this.match(RE_SD)) >= 0 || (e = this.match(RE_SD2)) >= 0) return this.token(T.Sd, e);
    if ((e = this.match(RE_HIDE)) >= 0) return this.token(T.HideEmpty, e);
    if (this.edges(false)) return;
    // `.` (every character reaches one of the rules above or this one).
    this.token(T.Invalid, p + 1);
  }

  private struct(): void {
    const p = this.p;
    const c = this.code(p);
    let e: number;
    if ((e = this.blanks()) >= 0) {
      this.p = e;
      return;
    }
    if ((e = this.comment()) >= 0) return this.token(Kind.Comment, e);
    if (c === LOWER_M && this.embed()) return;
    if (this.statements() || this.stateKeyword()) return;
    const dir = this.direction();
    if (dir) return this.token(dir[0], dir[1]);
    if (c === RBRACE) {
      this.token(T.StructStop, p + 1);
      return this.pop();
    }
    if (c === LF) {
      this.p++;
      return;
    }
    if (this.note() || this.edges(true)) return;
    this.error();
  }

  // --- embedded diagram blocks (ADR-15) ---

  /**
   * `mermaid <id>["Title"] {` opening a block: `mermaid` first on its line, a blank, and the
   * line ends in `{`. Anything else (`mermaid`, `mermaid --> B`, `mermaid sub["T"]`) is lexed
   * as before. The opener's parts, the body as one token and the closing `}` are written in
   * one step; the body is never lexed as state syntax.
   */
  private embed(): boolean {
    const p = this.p;
    if (!this.t.startsWith('mermaid', p) || !isBlank(this.code(p + 7))) return false;
    let b = p - 1;
    while (b >= 0 && isBlank(this.code(b))) b--;
    if (b >= 0 && this.code(b) !== LF) return false;
    const le = this.nextLf(p);
    let last = le - 1;
    while (last > p + 7 && isBlank(this.code(last))) last--;
    if (this.code(last) !== LBRACE) return false;
    let i = p + 7;
    while (i < last && isBlank(this.code(i))) i++;
    if (i === last) return false;
    this.emit(T.Embed, p, p + 7);
    this.embedHead(i, last);
    this.emit(T.EmbedOpen, last, last + 1);
    this.embedBody(le + 1);
    return true;
  }

  /** The opener between `mermaid` and its `{` at `last`: the id, then `["Title"]`. */
  private embedHead(from: number, last: number): void {
    let i = from;
    while (i < last && this.code(i) !== LBRACKET && !isBlank(this.code(i))) i++;
    if (i > from) this.emit(T.EmbedId, from, i);
    if (this.code(i) === LBRACKET) {
      // `["…"]`: the `]` after the closing quote; `[…]`: the first `]`.
      let k = i + 1;
      if (this.code(k) === DQUOTE) {
        k++;
        while (k < last && this.code(k) !== DQUOTE) k++;
        k++;
      }
      while (k < last && this.code(k) !== RBRACKET) k++;
      if (k < last) {
        this.emit(T.EmbedTitle, i, k + 1);
        i = k + 1;
      }
    }
    while (i < last && isBlank(this.code(i))) i++;
    if (i < last) this.emit(Kind.Error, i, last);
  }

  /** Whether the view line `[a, e)` ends in a `{` outside a `"…"` string. */
  private endsInBrace(a: number, e: number): boolean {
    let quoted = false;
    let last = -1;
    let lastQuoted = false;
    for (let j = a; j < e; j++) {
      const c = this.code(j);
      if (c === DQUOTE) quoted = !quoted;
      if (!isSpace(c)) {
        last = c;
        lastQuoted = quoted;
      }
    }
    return last === LBRACE && !lastQuoted;
  }

  /**
   * The body from view offset `s` (the line after the opener) to the `}` that closes it,
   * found by line: a line ending in `{` opens a level, a line starting with `}` closes one;
   * braces in `"…"` strings never count, and `%%` comment lines are not in the view at all.
   * The body's range is the source's, comment lines included.
   */
  private embedBody(s: number): void {
    const start = this.sourceEnd(s - 1, s);
    let depth = 1;
    for (let line = s; line < this.n; ) {
      const e = this.nextLf(line);
      let a = line;
      while (a < e && isBlank(this.code(a))) a++;
      if (this.code(a) === RBRACE && --depth === 0) {
        this.emitBody(start, this.sourceStart(line), s, line);
        this.emit(T.EmbedEnd, a, a + 1);
        this.p = a + 1;
        return;
      }
      if (this.endsInBrace(a, e)) depth++;
      line = e + 1;
    }
    this.emitBody(start, this.src.length, s, this.n);
    this.p = this.n;
  }

  /** The body token, from source offsets; the comment lines inside it are part of it. */
  private emitBody(start: number, end: number, a: number, b: number): void {
    this.flushRemoved(start);
    this.w.push(T.EmbedBody, start, Math.max(start, end));
    this.vs.push(a);
    this.ve.push(b);
    const r = this.view.removed;
    while (this.removed < r.length && (r[this.removed]?.start ?? 0) < end) this.removed++;
  }

  private stateRules(): void {
    const p = this.p;
    const c = this.code(p);
    let e: number;
    if ((e = this.blanks()) >= 0) {
      this.p = e;
      return;
    }
    if ((e = this.comment()) >= 0) return this.token(Kind.Comment, e);
    const le = this.lineEnd();
    for (let m = 0; m < MARKERS.length; m++) {
      let q = this.nextMarker(m, p);
      if (q < 0 || q >= le) continue;
      for (let r = this.nextMarker(m, q + 1); r >= 0 && r < le; r = this.nextMarker(m, r + 1))
        q = r;
      const end = q + (MARKERS[m]?.length ?? 0);
      this.emitTrimmed(MARKER_KINDS[m] ?? T.Fork, p, q);
      this.emit(T.Marker, q, end);
      this.p = end;
      return this.pop();
    }
    if (c === DQUOTE) {
      this.token(T.Quote, p + 1);
      return this.push(S.STATE_STRING);
    }
    if ((e = this.match(RE_AS)) >= 0) {
      this.token(T.As, e);
      return this.push(S.STATE_ID);
    }
    if ((e = this.multiWord()) >= 0) return this.token(T.MultiWordState, e);
    let i = p;
    while (i < this.n && this.code(i) !== LBRACE && !isSpace(this.code(i))) i++;
    if (i > p) return this.token(T.CompositeState, i);
    if (c === LF) {
      this.p++;
      return this.pop();
    }
    if (c === LBRACE) {
      this.token(T.StructStart, p + 1);
      this.pop();
      return this.push(S.struct);
    }
    this.error();
  }

  /**
   * `\w+\s+\w+.*?\{` (v12 throws "State name must be a single word"): the offset of the `{`,
   * which is left to open the struct, or -1.
   */
  private multiWord(): number {
    let i = this.p;
    while (isWord(this.code(i))) i++;
    if (i === this.p || !isSpace(this.code(i))) return -1;
    while (isSpace(this.code(i))) i++;
    if (!isWord(this.code(i))) return -1;
    if (this.braceAt !== -2 && this.braceAt <= i) {
      const k = this.t.indexOf('{', i + 1);
      this.braceAt = k < 0 ? -2 : k;
    }
    return this.braceAt >= 0 && this.braceAt < this.lineEnd(i) ? this.braceAt : -1;
  }

  /** The states that read one value, a keyword or a name. */
  private leaf(): void {
    const line = LINE_VALUES[this.state];
    if (line !== undefined) {
      // `[^\n]*`, then back to the state below.
      this.token(line, this.nextLf(this.p));
      return this.pop();
    }
    const p = this.p;
    const c = this.code(p);
    let e: number;
    switch (this.state) {
      case S.STATE_ID: {
        // `[^\n\{]*`, then `processId`.
        let i = p;
        while (i < this.n && this.code(i) !== LF && this.code(i) !== LBRACE) i++;
        if (this.processId(T.Id, p, i)) this.pop();
        return;
      }
      case S.STATE_STRING:
        if (c === DQUOTE) {
          this.token(T.Quote, p + 1);
          return this.pop();
        }
        return this.token(T.StateDescr, this.upTo('"'));
      case S.SCALE:
        return this.scale();
      case S.acc_descr_multiline:
        if (c === RBRACE) {
          this.token(T.AccDescrClose, p + 1);
          return this.pop();
        }
        return this.token(T.AccDescrMultilineValue, this.upTo('}'));
      case S.CLASSDEF:
      case S.CLASS:
      case S.STYLE:
        return this.styleNames();
      case S.NOTE:
        return this.noteSide();
      case S.NOTE_ID:
        return this.noteId();
      case S.NOTE_TEXT:
        return this.noteText();
      case S.FLOATING_NOTE:
        if ((e = this.match(RE_FLOATING_AS)) >= 0) {
          this.token(T.As, e);
          this.pop();
          return this.push(S.FLOATING_NOTE_ID);
        }
        if (c === DQUOTE) return this.token(T.Quote, p + 1);
        return this.token(T.NoteText, this.upTo('"'));
      case S.FLOATING_NOTE_ID:
        if (this.processId(T.Id, p, this.nextLf(p))) this.pop();
        return;
      default:
        return this.error();
    }
  }

  /** SCALE: `\d+` (WIDTH), or `\s+width\b`, which leaves it. */
  private scale(): void {
    if (isDigit(this.code(this.p))) {
      let i = this.p;
      while (isDigit(this.code(i))) i++;
      return this.token(T.Width, i);
    }
    const e = this.match(RE_WIDTH);
    if (e < 0) return this.error();
    this.token(T.ScaleWidth, e);
    this.pop();
  }

  /** The names after `classDef`, `class` and `style`; then the rest of the line. */
  private styleNames(): void {
    let e: number;
    let next: number;
    if (this.state === S.CLASSDEF) {
      next = S.CLASSDEFID;
      if ((e = this.match(RE_DEFAULT_ID)) >= 0) this.token(T.DefaultClassDefId, e);
      else if ((e = this.match(RE_WORD_SPACE)) >= 0) this.token(T.ClassDefId, e);
      else return this.error();
    } else if (this.state === S.CLASS) {
      next = S.CLASS_STYLE;
      if ((e = this.classIds()) < 0) return this.error();
      this.token(T.ClassEntityIds, e);
    } else {
      next = S.STYLEDEF_STYLES;
      if ((e = this.match(RE_IDS_SPACE)) < 0) return this.error();
      this.token(T.StyleIds, e);
    }
    this.pop();
    this.push(next);
  }

  /** `[^x]*` from `p`: the next `x`, or the end. */
  private upTo(x: string): number {
    const k = this.t.indexOf(x, this.p);
    return k < 0 ? this.n : k;
  }

  /** `(\w+)+((,\s*\w+)*)`: its end at `p`, or -1. */
  private classIds(): number {
    let i = this.p;
    while (isWord(this.code(i))) i++;
    if (i === this.p) return -1;
    for (;;) {
      if (this.code(i) !== COMMA) return i;
      let j = i + 1;
      while (isSpace(this.code(j))) j++;
      if (!isWord(this.code(j))) return i;
      while (isWord(this.code(j))) j++;
      i = j;
    }
  }

  private noteSide(): void {
    let e: number;
    if ((e = this.match(RE_LEFT_OF)) >= 0) this.token(T.LeftOf, e);
    else if ((e = this.match(RE_RIGHT_OF)) >= 0) this.token(T.RightOf, e);
    else if (this.code(this.p) === DQUOTE) {
      this.token(T.Quote, this.p + 1);
      this.pop();
      return this.push(S.FLOATING_NOTE);
    } else return this.error();
    this.pop();
    this.push(S.NOTE_ID);
  }

  /** `\s*[^:\n\s\-]+`, then `processId`. */
  private noteId(): void {
    const p = this.p;
    let i = p;
    while (isSpace(this.code(i))) i++;
    const s = i;
    while (i < this.n) {
      const x = this.code(i);
      if (x === COLON || x === LF || x === DASH || isSpace(x)) break;
      i++;
    }
    if (i === s) return this.error();
    if (!this.processId(T.Id, p, i)) return;
    this.pop();
    this.push(S.NOTE_TEXT);
  }

  private noteText(): void {
    const p = this.p;
    // `\s*:[^:\n;]+`, image `substr(2).trim()`.
    let i = p;
    while (isSpace(this.code(i))) i++;
    if (this.code(i) === COLON) {
      let j = i + 1;
      for (let e = this.textUnit(j); e >= 0; e = this.textUnit(j)) j = e;
      if (j > i + 1) {
        this.emitTrimmed(T.NoteText, p + 2, j);
        this.p = j;
        return this.pop();
      }
    }
    // `[\s\S]*?\n\s*end note\b`, image `slice(0, -8).trim()`.
    const k = this.endNote();
    if (k < 0) return this.error();
    this.emitTrimmed(T.NoteText, p, k);
    this.emit(T.EndNote, k, k + 8);
    this.p = k + 8;
    this.pop();
  }

  /** The first `end note\b` at or after `p` with a `\n` in the blanks before it, or -1. */
  private endNote(): number {
    const p = this.p;
    if (this.noEndNoteFrom >= 0 && this.noEndNoteFrom <= p) return -1;
    for (
      let k = this.lower.indexOf('end note', p);
      k >= 0;
      k = this.lower.indexOf('end note', k + 1)
    ) {
      if (isWord(this.code(k + 8))) continue;
      let j = k;
      while (j > p && isSpace(this.code(j - 1))) {
        j--;
        if (this.code(j) === LF) return k;
      }
    }
    this.noEndNoteFrom = p;
    return -1;
  }

  /** The one match jison tries on the empty rest of the text. */
  private atEnd(): void {
    const n = this.n;
    const line = LINE_VALUES[this.state];
    if (line !== undefined) return this.emit(line, n, n);
    switch (this.state) {
      case S.INITIAL:
        return this.emit(T.EndOfInput, n, n);
      case S.STATE_ID:
      case S.FLOATING_NOTE_ID:
        return this.emit(T.Id, n, n);
      case S.STATE_STRING:
        return this.emit(T.StateDescr, n, n);
      case S.acc_descr_multiline:
        return this.emit(T.AccDescrMultilineValue, n, n);
      case S.FLOATING_NOTE:
        return this.emit(T.NoteText, n, n);
      default:
    }
  }
}
