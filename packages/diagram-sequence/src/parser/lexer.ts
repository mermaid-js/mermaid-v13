/**
 * Sequence lexer: a state machine mirroring the start conditions and rule order of v12's
 * `sequenceDiagram.jison` (parser-method §1), modelled on the flowchart lexer:
 * - it lexes the text v12 lexed, with comments and directives cut out ({@link sourceView}), and
 *   maps each token back to its range in the source, which is never rewritten. A token that
 *   runs over a removed span is one token whose range covers it;
 * - comments and directives are trivia tokens, each with its own range, in source order; so
 *   are the `#`, `%` and `x%%` comments the jison lexer skipped;
 * - where jison threw (no rule matched), an `Error` token is written and lexing carries on in
 *   the initial state (for recovery).
 *
 * jison facts it reproduces: the first rule in order wins (no longest match); the lexer is
 * case-insensitive (ASCII letters only); keyword literals end in `\b`; `\n` in a rule is LF
 * only, while `\s` and `trim()` take every line terminator. Every scan is linear in the text
 * it consumes (R-PARSE-7).
 */
import {
  AT,
  BACKSLASH,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  GT,
  HASH,
  isDigit,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LF,
  LPAREN,
  LT,
  PERCENT,
  PIPE,
  RBRACE,
  RPAREN,
  SEMI,
  SLASH,
  TokenWriter,
} from '@mermaid-js/core/parser-kit';
import type { TokenStream } from '@mermaid-js/core/parser-kit';
import { firstHole, localOffset, SourceOffsets } from './source.ts';
import type { Hole, SourceView } from './source.ts';
import { T } from './tokens.ts';

// Start conditions of sequenceDiagram.jison (`CONFIG_DATA` is declared there, never entered).
const S = {
  INITIAL: 0,
  ID: 1,
  ALIAS: 2,
  LINE: 3,
  CONFIG: 4,
  acc_title: 5,
  acc_descr: 6,
  acc_descr_multiline: 7,
} as const;

/** What a keyword rule does after its literal. */
const B = {
  /** `\b`: the next character is not a word character. */
  Word: 0,
  /** `(?=[ \t]+[^/\\+()<>:\n,;\s-])`: the menu keywords `links`, `link`, … */
  Menu: 1,
} as const;

interface Keyword {
  /** Lower case. */
  word: string;
  kind: number;
  /** The state it begins, or -1. */
  begin: number;
  boundary: number;
}

const kw = (word: string, kind: number, begin = -1, boundary: number = B.Word) => ({
  word,
  kind,
  begin,
  boundary,
});

/** The INITIAL keyword literals, in rule order (built once). */
const KEYWORDS: readonly Keyword[] = [
  kw('box', T.Box, S.LINE),
  kw('participant', T.Participant, S.ID),
  kw('actor', T.ParticipantActor, S.ID),
  kw('create', T.Create),
  kw('destroy', T.Destroy, S.ID),
  kw('loop', T.Loop, S.LINE),
  kw('rect', T.Rect, S.LINE),
  kw('opt', T.Opt, S.LINE),
  kw('alt', T.Alt, S.LINE),
  kw('else', T.Else, S.LINE),
  kw('par', T.Par, S.LINE),
  kw('par_over', T.ParOver, S.LINE),
  kw('and', T.And, S.LINE),
  kw('critical', T.Critical, S.LINE),
  kw('option', T.Option, S.LINE),
  kw('break', T.Break, S.LINE),
  kw('end', T.End),
  kw('left of', T.LeftOf),
  kw('right of', T.RightOf),
  kw('links', T.Links, -1, B.Menu),
  kw('link', T.Link, -1, B.Menu),
  kw('properties', T.Properties, -1, B.Menu),
  kw('details', T.Details, -1, B.Menu),
  kw('over', T.Over),
  kw('note', T.Note),
  kw('activate', T.Activate, S.ID),
  kw('deactivate', T.Deactivate, S.ID),
];

/** The keywords after `title`/`accTitle`/`accDescr` in rule order. */
const LATE_KEYWORDS: readonly Keyword[] = [
  kw('sequencediagram', T.SD),
  kw('autonumber', T.Autonumber),
  kw('off', T.Off),
];

/** The arrow literals, in rule order (jison rules 61–86). `x` matches either case. */
const ARROWS: readonly (readonly [string, number])[] = [
  ['->>', T.SolidArrow],
  ['<<->>', T.BidirectionalSolidArrow],
  ['-->>', T.DottedArrow],
  ['<<-->>', T.BidirectionalDottedArrow],
  ['->', T.SolidOpenArrow],
  ['-->', T.DottedOpenArrow],
  ['-x', T.SolidCross],
  ['--x', T.DottedCross],
  ['-)', T.SolidPoint],
  ['--)', T.DottedPoint],
  ['--|\\', T.SolidArrowTopDotted],
  ['--|/', T.SolidArrowBottomDotted],
  ['--\\\\', T.StickArrowTopDotted],
  ['--//', T.StickArrowBottomDotted],
  ['/|--', T.SolidArrowTopReverseDotted],
  ['\\|--', T.SolidArrowBottomReverseDotted],
  ['//--', T.StickArrowTopReverseDotted],
  ['\\\\--', T.StickArrowBottomReverseDotted],
  ['-|\\', T.SolidArrowTop],
  ['-|/', T.SolidArrowBottom],
  ['-\\\\', T.StickArrowTop],
  ['-//', T.StickArrowBottom],
  ['/|-', T.SolidArrowTopReverse],
  ['\\|-', T.SolidArrowBottomReverse],
  ['//-', T.StickArrowTopReverse],
  ['\\\\-', T.StickArrowBottomReverse],
];

/** First characters of {@link ARROWS}. */
const isArrowStart = (c: number) => c === DASH || c === LT || c === SLASH || c === BACKSLASH;

/** ASCII lower case of `c`, for case-insensitive literals. */
const lower = (c: number) => (c >= 65 && c <= 90 ? c + 32 : c);

/** Not in the generic ACTOR rule's first class `[^/\\+()<\->:\n,;]`. */
const isActorStop = (c: number) =>
  c === SLASH || c === BACKSLASH || c === LPAREN || c === RPAREN || isActorTailStop(c);

/** Not in the generic ACTOR rule's repeated class `[^+<\->:\n,;]`. */
const isActorTailStop = (c: number) =>
  c === PLUS ||
  c === LT ||
  c === DASH ||
  c === GT ||
  c === COLON ||
  c === LF ||
  c === COMMA ||
  c === SEMI;

/** Not in the ID-state class `[^<>:\n,;@]`. */
const isIdStop = (c: number) =>
  c === LT || c === GT || c === COLON || c === LF || c === COMMA || c === SEMI || c === AT;

/** Not in `[^#\n;]` (TXT, `restOfLine`, `title`). */
const isLineStop = (c: number) => c === HASH || c === LF || c === SEMI;

/** Not in the menu keywords' lookahead class `[^/\\+()<>:\n,;\s-]`. */
const isMenuStop = (c: number) =>
  Number.isNaN(c) ||
  isSpace(c) ||
  c === SLASH ||
  c === BACKSLASH ||
  c === PLUS ||
  c === LPAREN ||
  c === RPAREN ||
  c === LT ||
  c === GT ||
  c === COLON ||
  c === COMMA ||
  c === SEMI ||
  c === DASH;

/** A blank of `((?!\n)\s)`. */
const isLineBlank = (c: number) => c !== LF && isSpace(c);

const LOWER_X = 0x78;
const PLUS = 0x2b;
const SPACE = 0x20;
const TAB = 0x09;

/**
 * Lex the sequence body `src[from…]`. `view` comes from {@link sourceView}.
 */
export function lex(src: string, from: number, view: SourceView): TokenStream {
  return new SequenceLexer(src, from, view).run();
}

/**
 * One lex. Offsets are into {@link text}, v12's text; {@link emit} maps them to the source.
 * Each start condition is a method named after it.
 */
class SequenceLexer {
  /** The text v12 lexed, plus the line break v12 appended (clamped in the output). */
  private readonly text: string;
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
    this.text = view.lexText + '\n';
    this.len = view.lexText.length;
    this.n = this.text.length;
    this.offsets = view.runs && new SourceOffsets(view.runs);
    this.holes = view.holes;
    this.hole = firstHole(view, from);
    this.p = localOffset(view, from);
    // About one token per four characters of sequence text.
    this.w = new TokenWriter(((this.len - this.p) >> 2) + 8);
  }

  run(): TokenStream {
    const { text, n } = this;
    // v12 trimmed leading blanks (after removing comments) before lexing.
    while (this.p < this.len && isSpace(text.charCodeAt(this.p))) this.p++;
    while (this.p < n) {
      if (!this.step(text.charCodeAt(this.p))) {
        // No rule matches (jison throws): an Error token, then the initial state again.
        const c = text.charCodeAt(this.p);
        this.emit(Kind.Error, this.p, c === LF ? this.p : this.p + 1);
        this.stack.length = 0;
        this.state = S.INITIAL;
      }
    }
    // At the end jison tries the rules once more on the empty input.
    const kind = this.endKind();
    if (kind !== -1) this.emit(kind, this.len, this.len);
    this.trivia(this.src.length + 1);
    return this.w.finish(this.src);
  }

  /** The token a rule matching the empty input at the end gives in the current state. */
  private endKind(): number {
    switch (this.state) {
      case S.INITIAL:
        return T.Eof;
      case S.ALIAS:
        return T.AliasEnd;
      case S.LINE:
        return T.RestOfLine;
      case S.acc_title:
        return T.AccTitleValue;
      case S.acc_descr:
        return T.AccDescrValue;
      case S.acc_descr_multiline:
        return T.AccDescrMultilineValue;
      default:
        return -1;
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
   * a trimmed token ends before the blanks it consumed.
   */
  private emit(kind: number, s: number, end: number, next: number = end): true {
    let a = this.source(s);
    const last = Math.min(end, this.len);
    let b = last > s ? this.source(last - 1) + 1 : a;
    // A line break starts at the CR of its CRLF (cut from the text).
    if (b > a && this.src.charCodeAt(a) === LF && this.src.charCodeAt(a - 1) === CR) a--;
    if (this.holes.length > 0) {
      this.trivia(a);
      if (b > a) b = this.dropAt(b);
    }
    this.w.push(kind, a, b);
    this.p = next;
    return true;
  }

  /** Write `text[s, e)` trimmed (jison's `yytext.trim()`), and move past it. */
  private trimmed(kind: number, s: number, e: number): true {
    let a = s;
    let b = e;
    while (a < b && isSpace(this.text.charCodeAt(a))) a++;
    while (b > a && isSpace(this.text.charCodeAt(b - 1))) b--;
    return this.emit(kind, a, b, e);
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

  /** The end of the run of `[^#\n;]` from `q`. */
  private lineRun(q: number): number {
    let j = q;
    while (j < this.n && !isLineStop(this.text.charCodeAt(j))) j++;
    return j;
  }

  /** Whether the case-insensitive literal `word` (lower case) is at `q`. */
  private literal(word: string, q: number): boolean {
    if (q + word.length > this.n) return false;
    for (let k = 0; k < word.length; k++) {
      if (lower(this.text.charCodeAt(q + k)) !== word.charCodeAt(k)) return false;
    }
    return true;
  }

  /** `as` followed by `\s`, at `q` (the alias lookahead `\s+as\s`, after its blanks). */
  private asAt(q: number): boolean {
    return this.literal('as', q) && isSpace(this.text.charCodeAt(q + 2));
  }

  // --- States -------------------------------------------------------------------------------

  private step(c: number): boolean {
    switch (this.state) {
      case S.INITIAL:
        return this.initial(c);
      case S.ID:
        return this.id(c);
      case S.ALIAS:
        return this.alias(c);
      case S.LINE:
        return this.line(c);
      case S.CONFIG:
        return this.config(c);
      case S.acc_title:
      case S.acc_descr:
        return this.accValue();
      default:
        return this.accDescrMultiline(c);
    }
  }

  private initial(c: number): boolean {
    const { text, p } = this;
    // [\n]+ and \s+
    if (c === LF) {
      let e = p + 1;
      while (text.charCodeAt(e) === LF) e++;
      return this.emit(Kind.Newline, p, e);
    }
    if (isSpace(c)) {
      this.p = this.blanks(p);
      return true;
    }
    // Comments: `#[^\n]*`, `%(?!\{)[^\n]*`, `[^\}]%%[^\n]*`.
    if (
      c === HASH ||
      (c === PERCENT && text.charCodeAt(p + 1) !== LBRACE) ||
      (c !== RBRACE && text.charCodeAt(p + 1) === PERCENT && text.charCodeAt(p + 2) === PERCENT)
    ) {
      return this.emit(Kind.Comment, p, this.lineEnd(p));
    }
    if (this.num(c)) return true;
    if (this.keyword(KEYWORDS)) return true;
    if (this.titles(c)) return true;
    if (this.acc(c)) return true;
    if (this.keyword(LATE_KEYWORDS)) return true;
    if (c === COMMA) return this.emit(T.Comma, p, p + 1);
    if (c === SEMI) return this.emit(T.Semi, p, p + 1);
    if (this.actor(c)) return true;
    if (isArrowStart(c) && this.arrow()) return true;
    if (c === COLON) return this.emit(T.Txt, p, this.lineRun(p + 1));
    if (c === PLUS) return this.emit(T.Plus, p, p + 1);
    if (c === DASH) return this.emit(T.Minus, p, p + 1);
    if (c === LPAREN && text.charCodeAt(p + 1) === RPAREN) return this.emit(T.Parens, p, p + 2);
    // `.`: one code unit (line terminators were taken by `\s+`).
    return this.emit(T.Invalid, p, p + 1);
  }

  /** `([0-9]+(\.[0-9]{1,2})?|\.[0-9]{1,2})(?=[ \n]+)` */
  private num(c: number): boolean {
    const { text, p } = this;
    let e = p;
    while (isDigit(text.charCodeAt(e))) e++;
    if (e === p && c !== DOT) return false;
    if (text.charCodeAt(e) === DOT && isDigit(text.charCodeAt(e + 1))) {
      e += 2;
      if (isDigit(text.charCodeAt(e))) e++;
    } else if (e === p) return false;
    const d = text.charCodeAt(e);
    if (d !== SPACE && d !== LF) return false;
    return this.emit(T.Num, p, e);
  }

  private keyword(list: readonly Keyword[]): boolean {
    const { text, p } = this;
    const c = lower(text.charCodeAt(p));
    for (const k of list) {
      if (k.word.charCodeAt(0) !== c || !this.literal(k.word, p)) continue;
      const e = p + k.word.length;
      if (k.boundary === B.Word) {
        if (isWord(text.charCodeAt(e))) continue;
      } else {
        let j = e;
        while (text.charCodeAt(j) === SPACE || text.charCodeAt(j) === TAB) j++;
        if (j === e || isMenuStop(text.charCodeAt(j))) continue;
      }
      this.emit(k.kind, p, e);
      if (k.begin !== -1) this.push(k.begin);
      return true;
    }
    return false;
  }

  /** `title\s[^#\n;]+` and `title:\s[^#\n;]+`. */
  private titles(c: number): boolean {
    if (lower(c) !== 116 || !this.literal('title', this.p)) return false;
    const q = this.p + 5;
    const colon = this.text.charCodeAt(q) === COLON ? 1 : 0;
    if (!isSpace(this.text.charCodeAt(q + colon))) return false;
    const e = this.lineRun(q + colon + 1);
    if (e === q + colon + 1) return false;
    return this.emit(colon ? T.LegacyTitle : T.Title, this.p, e);
  }

  /** `accTitle\s*:\s*`, `accDescr\s*:\s*` and `accDescr\s*\{\s*`. */
  private acc(c: number): boolean {
    const { text, p } = this;
    if (lower(c) !== 97) return false;
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

  /**
   * The generic ACTOR rule, trimmed: a run of the first class, then repeats of
   * `(?!arrow prefix)-*` and a run of the second class. Greedy without backtracking: each
   * repeat stops at a character neither class takes, so no shorter split matches more.
   */
  private actor(c: number): boolean {
    const { text, p } = this;
    if (isActorStop(c)) return false;
    let q = p + 1;
    while (q < this.n && !isActorStop(text.charCodeAt(q))) q++;
    for (;;) {
      if (this.arrowPrefix(q)) break;
      let j = q;
      while (text.charCodeAt(j) === DASH) j++;
      if (j >= this.n || isActorTailStop(text.charCodeAt(j))) break;
      while (j < this.n && !isActorTailStop(text.charCodeAt(j))) j++;
      q = j;
    }
    return this.trimmed(T.Actor, p, q);
  }

  /**
   * The ACTOR rule's negative lookahead: `-x`, `--x`, `-)`, `--)`, `-|\`, `-\`, `-/`, `-//`,
   * `-|/`, `/|-`, `\|-`, `//-`, `\\-`, `--|\`, `--` or `()` at `q`.
   */
  private arrowPrefix(q: number): boolean {
    const t = this.text;
    const c = t.charCodeAt(q);
    const d = t.charCodeAt(q + 1);
    if (c === DASH) {
      if (lower(d) === LOWER_X || d === RPAREN || d === BACKSLASH || d === SLASH || d === DASH)
        return true;
      const e = t.charCodeAt(q + 2);
      return d === PIPE && (e === BACKSLASH || e === SLASH);
    }
    if (c === SLASH || c === BACKSLASH) {
      return (d === PIPE || d === c) && t.charCodeAt(q + 2) === DASH;
    }
    return c === LPAREN && d === RPAREN;
  }

  private arrow(): boolean {
    for (const [word, kind] of ARROWS) {
      if (this.literal(word, this.p)) return this.emit(kind, this.p, this.p + word.length);
    }
    return false;
  }

  private id(c: number): boolean {
    const { text, p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    if (c === AT && text.charCodeAt(p + 1) === LBRACE) {
      this.emit(T.ConfigStart, p, p + 2);
      this.push(S.CONFIG);
      return true;
    }
    // `[^<>:\n,;@\s]+` followed by `\s*@\{` (stays in ID) or `\s+as\s` (to ALIAS).
    let e = p;
    while (e < this.n && !isIdStop(text.charCodeAt(e)) && !isSpace(text.charCodeAt(e))) e++;
    if (e > p) {
      const j = this.blanks(e);
      if (text.charCodeAt(j) === AT && text.charCodeAt(j + 1) === LBRACE) {
        return this.emit(T.Actor, p, e);
      }
      if (j > e && this.asAt(j)) {
        this.emit(T.Actor, p, e);
        this.push(S.ALIAS);
        return true;
      }
    }
    return this.idRun(c, e);
  }

  /**
   * The ID rules after the lookahead ones, from the end `from` of the run without blanks:
   * `[^<>:\n,;@]+(?=\s*[\n;#]|$)` (the whole run when a line end or `;` follows it, else the
   * run up to its last `#`, where the lookahead backtracks to), then `[^<>:\n,;@]*<[^\n]*` and
   * `[^\n]+` (trimmed), both INVALID.
   */
  private idRun(c: number, from: number): boolean {
    const { text, p } = this;
    let e = from;
    while (e < this.n && !isIdStop(text.charCodeAt(e))) e++;
    const d = text.charCodeAt(e);
    if (e > p) {
      let end = d === LF || d === SEMI || e >= this.n ? e : -1;
      for (let h = e - 1; end === -1 && h > p; h--) if (text.charCodeAt(h) === HASH) end = h;
      if (end !== -1) {
        this.trimmed(T.Actor, p, end);
        this.pop();
        return true;
      }
    }
    // `[^<>:\n,;@]*<[^\n]*` and `[^\n]+` (trimmed): INVALID.
    if (d === LT) {
      this.emit(T.Invalid, p, this.lineEnd(e));
      this.pop();
      return true;
    }
    if (c === LF) return false;
    this.trimmed(T.Invalid, p, this.lineEnd(p));
    this.pop();
    return true;
  }

  private alias(c: number): boolean {
    const { p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(this.text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    this.pop();
    this.pop();
    if (this.literal('as', p) && !isWord(this.text.charCodeAt(p + 2))) {
      this.emit(T.As, p, p + 2);
      this.push(S.LINE);
      return true;
    }
    return this.emit(T.AliasEnd, p, p);
  }

  private line(c: number): boolean {
    const { p } = this;
    if (isLineBlank(c)) {
      let e = p + 1;
      while (isLineBlank(this.text.charCodeAt(e))) e++;
      this.p = e;
      return true;
    }
    if (c === HASH) return this.emit(Kind.Comment, p, this.lineEnd(p));
    this.pop();
    return this.emit(T.RestOfLine, p, this.lineRun(p));
  }

  private config(c: number): boolean {
    const { text, p } = this;
    if (c !== RBRACE) {
      const e = text.indexOf('}', p);
      return this.emit(T.ConfigContent, p, e === -1 ? this.n : e);
    }
    this.emit(T.ConfigEnd, p, p + 1);
    this.pop();
    // `\}(?=\s+as\s)`: on to ALIAS; else out of ID too.
    const j = this.blanks(p + 1);
    if (j > p + 1 && this.asAt(j)) this.push(S.ALIAS);
    else this.pop();
    return true;
  }

  /** `[^\n]*` (the acc title and the one-line acc description). */
  private accValue(): boolean {
    const kind = this.state === S.acc_title ? T.AccTitleValue : T.AccDescrValue;
    this.pop();
    return this.emit(kind, this.p, this.lineEnd(this.p));
  }

  private accDescrMultiline(c: number): boolean {
    const { text, p } = this;
    if (c === RBRACE) {
      this.pop();
      return this.emit(T.AccDescrMultilineEnd, p, p + 1);
    }
    const e = text.indexOf('}', p);
    return this.emit(T.AccDescrMultilineValue, p, e === -1 ? this.n : e);
  }
}
