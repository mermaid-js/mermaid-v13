/**
 * Quadrant lexer: v12's `quadrant.jison` lexer rules ({@link RULES}, one per jison rule, in
 * jison's order), run on exactly the text v12's lexer saw ({@link v12Text}), with every token
 * mapped back to its source range (DESIGN §4.3). The source is never rewritten. Comments and
 * directives v12 removed before lexing, and the `%%` comments jison's own rules skip, are trivia
 * tokens with their own ranges, in source order.
 *
 * jison semantics kept: per start condition (all exclusive, `%x`), the first rule that matches
 * wins (no longest match); the lexer is case-insensitive (ASCII letters only); bare word
 * literals (`title`, `classDef`) end in `\b`, padded and regex keywords do not; a rule without a
 * token still writes a v13 token for its match (`"`, `:::`, …; the gate leaves them out); at the
 * end of the text the rules are tried once more (`<<EOF>>`, empty values), then lexing stops.
 * Where jison would throw, v13 writes one `Error` token (zero-width before a line break, else
 * one code point), resets to the initial state and carries on (for recovery).
 *
 * Every scan is linear in the text it consumes (R-PARSE-7): a rule that starts with a blank run
 * and fails remembers the run's end, so the blanks after it fail at once (pitfall 5).
 */
// cspell:words acctitle accdescr classdef quadrantchart
import {
  AMP,
  BACKSLASH,
  BACKTICK,
  codePointEnd,
  COLON,
  COMMA,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  GT,
  HASH,
  isDigit,
  isSpace,
  isWord,
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  PERCENT,
  QUESTION,
  RBRACE,
  RBRACKET,
  SEMI,
  SLASH,
  SPACE,
  STAR,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';
import type { V12Text } from './v12-text.ts';

/** Start conditions of quadrant.jison (all exclusive). */
const S = {
  INITIAL: 0,
  title: 1,
  acc_title: 2,
  acc_descr: 3,
  acc_descr_multiline: 4,
  md_string: 5,
  string: 6,
  class_name: 7,
  point_start: 8,
  point_x: 9,
  point_y: 10,
} as const;

/** Start condition names by number, for the probe's lexer mode (jison's names). */
const S_NAMES: readonly string[] = Object.keys(S);

/**
 * Word kinds: a cursor right after one extends it (`title¦`, `tit¦`), so the probe's mode there
 * is that of the step that lexed it, not of the next step (`title`'s value).
 */
const WORD_KINDS = new Set<number>([
  T.Title,
  T.ClassDef,
  T.Alpha,
  T.Num,
  T.UnicodeText,
  T.ClassName,
]);

/** What a rule does to the start-condition stack. */
const A = {
  none: 0,
  begin: 1,
  pop: 2,
  /** `this.popState(); this.begin(…)`. */
  popBegin: 3,
} as const;

interface Rule {
  /** End of the match at `p`, or -1. */
  readonly match: (x: Scan, p: number) => number;
  /** The token kind written for the match (a trivia kind for the skipped comments). */
  readonly kind: number;
  readonly action: number;
  readonly state: number;
  /**
   * For a rule that starts with a blank run (`" "*` or `\s*`) and whose outcome depends only on
   * the text after it: the end of that run from `p`.
   */
  readonly lead: ((x: Scan, p: number) => number) | undefined;
}

/** The text being lexed and its length (appended `\n` included). */
interface Scan {
  readonly text: string;
  readonly n: number;
}

const PLUS = 0x2b;
const EXCLAMATION = 0x21;
const DOLLAR = 0x24;
const APOSTROPHE = 0x27;

const code = (x: Scan, p: number) => x.text.charCodeAt(p);

/** ASCII lower case (jison's `case-insensitive` folds ASCII letters only). */
const fold = (c: number) => (c >= 0x41 && c <= 0x5a ? c + 0x20 : c);

/** End of the case-insensitive `word` (lower case) at `p`, or -1. */
function literal(x: Scan, word: string, p: number): number {
  if (p + word.length > x.n) return -1;
  for (let k = 0; k < word.length; k++) {
    if (fold(x.text.charCodeAt(p + k)) !== word.charCodeAt(k)) return -1;
  }
  return p + word.length;
}

/** End of the run of U+0020 from `p` (`" "*`). */
function spaces(x: Scan, p: number): number {
  let j = p;
  while (j < x.n && x.text.charCodeAt(j) === SPACE) j++;
  return j;
}

/** End of the run of `\s` from `p`. */
function blanks(x: Scan, p: number): number {
  let j = p;
  while (j < x.n && isSpace(x.text.charCodeAt(j))) j++;
  return j;
}

/** The first LF at or after `p` (`[^\n]*` ends there), else the end. */
function lineEnd(x: Scan, p: number): number {
  const e = x.text.indexOf('\n', p);
  return e === -1 ? x.n : e;
}

/** `[^c]*`: up to the next `c`, else the end. */
function until(x: Scan, c: string, p: number): number {
  const e = x.text.indexOf(c, p);
  return e === -1 ? x.n : e;
}

/** A word literal with jison's trailing `\b`. */
const keyword =
  (word: string) =>
  (x: Scan, p: number): number => {
    const e = literal(x, word, p);
    return e < 0 || isWord(code(x, e)) ? -1 : e;
  };

/** `" "*"word"" "*`. */
const padded =
  (word: string) =>
  (x: Scan, p: number): number => {
    const e = literal(x, word, spaces(x, p));
    return e < 0 ? -1 : spaces(x, e);
  };

/** `word\s*"c"\s*` (`accTitle:`, `accDescr:`, `accDescr {`). */
const wordThen =
  (word: string, c: number) =>
  (x: Scan, p: number): number => {
    const e = literal(x, word, p);
    if (e < 0) return -1;
    const b = blanks(x, e);
    return code(x, b) === c ? blanks(x, b + 1) : -1;
  };

/** One character. */
const char =
  (c: number) =>
  (x: Scan, p: number): number =>
    code(x, p) === c ? p + 1 : -1;

/** Two characters. */
const pair =
  (a: number, b: number) =>
  (x: Scan, p: number): number =>
    code(x, p) === a && code(x, p + 1) === b ? p + 2 : -1;

/** A non-empty run of characters `test` accepts. */
const run =
  (test: (c: number) => boolean) =>
  (x: Scan, p: number): number => {
    let j = p;
    while (j < x.n && test(x.text.charCodeAt(j))) j++;
    return j > p ? j : -1;
  };

/** What a regex `.` matches: anything but a line terminator. */
const isDotChar = (c: number) => c !== LF && c !== 0x0d && c !== 0x2028 && c !== 0x2029;

/** `(1)|(0(.\d+)?)`: the `.` is any character but a line terminator. */
function coordinate(x: Scan, p: number): number {
  const c = code(x, p);
  if (c === 0x31) return p + 1;
  if (c !== 0x30) return -1;
  if (p + 1 < x.n && isDotChar(code(x, p + 1)) && isDigit(code(x, p + 2))) {
    let j = p + 3;
    while (j < x.n && isDigit(code(x, j))) j++;
    return j;
  }
  return p + 1;
}

/** `%%(?!\{)[^\n]*`. */
function comment(x: Scan, p: number): number {
  if (code(x, p) !== PERCENT || code(x, p + 1) !== PERCENT || code(x, p + 2) === LBRACE) return -1;
  return lineEnd(x, p + 2);
}

/** `[^\}]\%\%[^\n]*`: a comment that takes the character before it (a line break too). */
function commentAfter(x: Scan, p: number): number {
  if (p >= x.n || code(x, p) === RBRACE) return -1;
  if (code(x, p + 1) !== PERCENT || code(x, p + 2) !== PERCENT) return -1;
  return lineEnd(x, p + 3);
}

/** `%%[^\n]*`. */
function anyComment(x: Scan, p: number): number {
  return code(x, p) === PERCENT && code(x, p + 1) === PERCENT ? lineEnd(x, p + 2) : -1;
}

/** `" "*\-\-+\>" "*`. */
function delimiter(x: Scan, p: number): number {
  const s = spaces(x, p);
  let j = s;
  while (j < x.n && code(x, j) === DASH) j++;
  if (j - s < 2 || code(x, j) !== GT) return -1;
  return spaces(x, j + 1);
}

/**
 * The end of `" "*\-*` from `p`: a failed {@link delimiter} fails from every start before it
 * (not at it: a new `" "*` run may start there).
 */
function spacesThenDashes(x: Scan, p: number): number {
  let j = spaces(x, p);
  while (j < x.n && code(x, j) === DASH) j++;
  return j;
}

/** `\s*\:\s*\[\s*`. */
function pointStart(x: Scan, p: number): number {
  const a = blanks(x, p);
  if (code(x, a) !== COLON) return -1;
  const b = blanks(x, a + 1);
  return code(x, b) === LBRACKET ? blanks(x, b + 1) : -1;
}

/** `\s*c\s*` (with `c` `,`) or `\s*c" "*` (with `c` `]`). */
const around =
  (c: number, after: (x: Scan, p: number) => number) =>
  (x: Scan, p: number): number => {
    const a = blanks(x, p);
    return code(x, a) === c ? after(x, a + 1) : -1;
  };

const isAsciiLetter = (c: number) => (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
const isNewline = (c: number) => c === LF || c === 0x0d;

/**
 * jison's `PUNCTUATION` class: `!`, `"`, `#`, `$`, `%`, `&`, `'`, `*`, `+`, `,`, `-`, `.`, the
 * backtick, `?`, the backslash, `_` and `/`.
 */
function isPunctuation(c: number): boolean {
  return (
    c === EXCLAMATION ||
    c === DQUOTE ||
    c === HASH ||
    c === DOLLAR ||
    c === PERCENT ||
    c === AMP ||
    c === APOSTROPHE ||
    c === STAR ||
    c === PLUS ||
    c === COMMA ||
    c === DASH ||
    c === DOT ||
    c === BACKTICK ||
    c === QUESTION ||
    c === BACKSLASH ||
    c === UNDERSCORE ||
    c === SLASH
  );
}

const rule = (
  match: Rule['match'],
  kind: number,
  action: number = A.none,
  state: number = S.INITIAL,
  lead?: (x: Scan, p: number) => number
): Rule => ({ match, kind, action, state, lead });

/** The rules of quadrant.jison; index = jison rule number (from 0). */
const RULES: readonly Rule[] = [
  /* 0 */ rule(comment, Kind.Comment),
  /* 1 */ rule(commentAfter, Kind.Comment),
  /* 2 */ rule(run(isNewline), Kind.Newline),
  /* 3 */ rule(anyComment, Kind.Comment),
  /* 4 */ rule(keyword('title'), T.Title, A.begin, S.title),
  /* 5 */ rule(lineEnd, T.TitleValue, A.pop),
  /* 6 */ rule(wordThen('acctitle', COLON), T.AccTitle, A.begin, S.acc_title),
  /* 7 */ rule(lineEnd, T.AccTitleValue, A.pop),
  /* 8 */ rule(wordThen('accdescr', COLON), T.AccDescr, A.begin, S.acc_descr),
  /* 9 */ rule(lineEnd, T.AccDescrValue, A.pop),
  /* 10 */ rule(wordThen('accdescr', LBRACE), T.AccDescrMultiline, A.begin, S.acc_descr_multiline),
  /* 11 */ rule(char(RBRACE), T.AccDescrMultilineEnd, A.pop),
  /* 12 */ rule((x, p) => until(x, '}', p), T.AccDescrMultilineValue),
  /* 13 */ rule(padded('x-axis'), T.XAxis, A.none, S.INITIAL, spaces),
  /* 14 */ rule(padded('y-axis'), T.YAxis, A.none, S.INITIAL, spaces),
  /* 15 */ rule(delimiter, T.AxisTextDelimiter, A.none, S.INITIAL, spacesThenDashes),
  /* 16 */ rule(padded('quadrant-1'), T.Quadrant1, A.none, S.INITIAL, spaces),
  /* 17 */ rule(padded('quadrant-2'), T.Quadrant2, A.none, S.INITIAL, spaces),
  /* 18 */ rule(padded('quadrant-3'), T.Quadrant3, A.none, S.INITIAL, spaces),
  /* 19 */ rule(padded('quadrant-4'), T.Quadrant4, A.none, S.INITIAL, spaces),
  /* 20 */ rule(keyword('classdef'), T.ClassDef),
  /* 21 */ rule(pair(DQUOTE, BACKTICK), T.MdStringStart, A.begin, S.md_string),
  /* 22 */ rule(
    run((c) => c !== BACKTICK && c !== DQUOTE),
    T.MdStr
  ),
  /* 23 */ rule(pair(BACKTICK, DQUOTE), T.MdStringEnd, A.pop),
  /* 24 */ rule(char(DQUOTE), T.StringStart, A.begin, S.string),
  /* 25 */ rule(char(DQUOTE), T.StringEnd, A.pop),
  /* 26 */ rule((x, p) => until(x, '"', p), T.Str),
  /* 27 */ rule(
    (x, p) =>
      code(x, p) === COLON && code(x, p + 1) === COLON && code(x, p + 2) === COLON ? p + 3 : -1,
    T.ClassMarker,
    A.begin,
    S.class_name
  ),
  /* 28 */ rule(run(isWord), T.ClassName, A.pop),
  /* 29 */ rule(pointStart, T.PointStart, A.begin, S.point_start, blanks),
  /* 30 */ rule(coordinate, T.PointX, A.begin, S.point_x),
  /* 31 */ rule(around(RBRACKET, spaces), T.PointEnd, A.pop),
  /* 32 */ rule(around(COMMA, blanks), T.PointComma, A.popBegin, S.point_y),
  /* 33 */ rule(coordinate, T.PointY, A.pop),
  /* 34 */ rule(padded('quadrantchart'), T.Quadrant, A.none, S.INITIAL, spaces),
  /* 35 */ rule(run(isAsciiLetter), T.Alpha),
  /* 36 */ rule(
    run((c) => c > 0x7f),
    T.UnicodeText
  ),
  /* 37 */ rule(char(COLON), T.Colon),
  /* 38 */ rule(char(PLUS), T.Plus),
  /* 39 */ rule(char(COMMA), T.Comma),
  /* 40 */ rule(char(EQUALS), T.Equals),
  /* 41 */ rule(char(EQUALS), T.Equals),
  /* 42 */ rule(char(STAR), T.Mult),
  /* 43 */ rule(char(HASH), T.Brkt),
  /* 44 */ rule(char(UNDERSCORE), T.Underscore),
  /* 45 */ rule(char(DOT), T.Dot),
  /* 46 */ rule(char(AMP), T.Amp),
  /* 47 */ rule(char(DASH), T.Minus),
  /* 48 */ rule(run(isDigit), T.Num),
  /* 49 */ rule((x, p) => (p < x.n && isSpace(code(x, p)) ? p + 1 : -1), T.Space),
  /* 50 */ rule(char(SEMI), T.Semi),
  /* 51 */ rule((x, p) => (isPunctuation(code(x, p)) ? p + 1 : -1), T.Punctuation),
  /* 52 */ rule((x, p) => (p === x.n ? p : -1), T.Eof),
];

/** Rule numbers of each start condition, in order. */
const CONDITIONS: readonly (readonly number[])[] = [
  /* INITIAL */ [
    0, 1, 2, 3, 4, 6, 8, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 24, 27, 29, 34, 35, 36, 37, 38, 39,
    40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52,
  ],
  /* title */ [5],
  /* acc_title */ [7],
  /* acc_descr */ [9],
  /* acc_descr_multiline */ [11, 12],
  /* md_string */ [22, 23],
  /* string */ [25, 26],
  /* class_name */ [28],
  /* point_start */ [30, 31],
  /* point_x */ [32],
  /* point_y */ [33],
];

/** A lex: the tokens (source offsets), and each token's range in v12's text. */
export interface QuadrantLex {
  tokens: TokenStream;
  /** Start of token `i` in {@link V12Text.text}; trivia from removed spans get -1. */
  textStart: Int32Array;
  /** End of token `i` in {@link V12Text.text} (it may include the `\n` v12 appended). */
  textEnd: Int32Array;
  v12: V12Text;
}

/**
 * Lex a quadrant source as v12 saw it (`v12`), writing v12's removed spans as trivia. `onRule`
 * is told the jison rule number of every rule that matches (dev use: the rule-coverage gate).
 * With a `probe`, the start condition at the probe's offset is recorded as its mode (R-LANG-7).
 */
export function lex(
  src: string,
  v12: V12Text,
  onRule?: (rule: number) => void,
  probe?: Probe
): QuadrantLex {
  return new QuadrantLexer(src, v12, onRule).run(probe);
}

class QuadrantLexer {
  private readonly scan: Scan;
  private readonly w: TokenWriter;
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private hole = 0;
  private readonly holes: readonly Hole[];
  /** Per blank-led rule, the end of the blank run it last failed across (else -1). */
  private readonly failedTo = new Int32Array(RULES.length).fill(-1);

  constructor(
    private readonly src: string,
    private readonly v12: V12Text,
    private readonly onRule: ((rule: number) => void) | undefined
  ) {
    this.scan = { text: v12.text, n: v12.text.length };
    this.holes = v12.holes;
    // About one token per three characters.
    this.w = new TokenWriter(((v12.text.length / 3) | 0) + 8);
  }

  run(probe?: Probe): QuadrantLex {
    const { n } = this.scan;
    let p = 0;
    for (let done = false; !done; ) {
      if (p >= n) done = true;
      const before = p;
      const mode = probe ? (S_NAMES[this.state] ?? '') : '';
      const at = this.step(p);
      if (at >= 0) p = at;
      else if (p < n) {
        // Zero-width before a line break, so the initial state lexes it; else one code point,
        // so the token never splits an emoji.
        const c = this.scan.text.charCodeAt(p);
        const end = c === LF ? p : codePointEnd(this.scan.text, p);
        this.emit(Kind.Error, p, end);
        this.stack.length = 0;
        this.state = S.INITIAL;
        p = end;
      }
      if (probe) {
        const start = this.sourceStart(before);
        let end = p > before ? this.sourceEnd(p - 1) : start;
        // The step holds an offset right after its word (`Probe.lexed` takes `end` exclusive).
        if (p > before && WORD_KINDS.has(this.lastKind)) end++;
        probe.lexed(start, end, mode);
      }
    }
    probe?.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    this.trivia(this.src.length + 1);
    const tokens = this.w.finish(this.src);
    this.starts.push(this.v12.length);
    this.ends.push(this.v12.length);
    return {
      tokens,
      textStart: Int32Array.from(this.starts),
      textEnd: Int32Array.from(this.ends),
      v12: this.v12,
    };
  }

  /** Apply the first matching rule of the current state at `p`: the new offset, or -1. */
  /** Kind of the token the last step wrote (`Kind.Error` when none matched). */
  private lastKind: number = Kind.Error;

  private step(p: number): number {
    this.lastKind = Kind.Error;
    for (const k of CONDITIONS[this.state] ?? []) {
      const r = RULES[k] as Rule;
      if (r.lead && p < (this.failedTo[k] ?? -1)) continue;
      const e = r.match(this.scan, p);
      if (e < 0) {
        // Every later start before the end of the run fails the same way; at its end a new
        // run may start (`- -->`: the space after the lone dash starts a delimiter).
        if (r.lead) this.failedTo[k] = r.lead(this.scan, p);
        continue;
      }
      this.onRule?.(k);
      this.lastKind = r.kind;
      this.act(r);
      this.emit(r.kind, p, e);
      return e;
    }
    return -1;
  }

  private act(r: Rule): void {
    switch (r.action) {
      case A.begin:
        this.stack.push(this.state);
        this.state = r.state;
        break;
      case A.pop:
        this.state = this.stack.pop() ?? S.INITIAL;
        break;
      case A.popBegin:
        this.state = r.state;
        break;
      default:
        break;
    }
  }

  // --- Offsets and output -------------------------------------------------------------------

  /** Source offset where `text[i]` starts (the end of the source past v12's own text). */
  private sourceStart(i: number): number {
    const v = this.v12;
    if (i >= v.length) return this.src.length;
    return v.starts ? (v.starts[i] ?? 0) : v.from + i;
  }

  /** Source offset where `text[i]` ends. */
  private sourceEnd(i: number): number {
    const v = this.v12;
    if (i >= v.length) return this.src.length;
    return v.ends ? (v.ends[i] ?? 0) : v.from + i + 1;
  }

  /** Write the removed spans that start before `at` (a source offset) as trivia. */
  private trivia(at: number): void {
    const hs = this.holes;
    for (let h = hs[this.hole]; h && h.start < at; h = hs[++this.hole]) {
      this.w.push(h.kind === 'comment' ? Kind.Comment : Kind.Directive, h.start, h.end);
      this.starts.push(-1);
      this.ends.push(-1);
    }
  }

  /**
   * Write `text[s, e)` with its source range. The `\n` v12 appended is no source text: a token
   * that ends with it ends at the source's last character it took (zero-width at the end when it
   * took only that `\n`), so it never encloses a trailing comment.
   */
  private emit(kind: number, s: number, e: number): void {
    const start = this.sourceStart(s);
    const last = Math.min(e, this.v12.length);
    const end = last > s ? Math.max(start, this.sourceEnd(last - 1)) : start;
    this.trivia(start);
    this.w.push(kind, start, end);
    this.starts.push(s);
    this.ends.push(e);
  }
}
