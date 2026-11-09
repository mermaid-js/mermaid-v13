/**
 * XY chart lexer: v12's `xychart.jison` lexer rules ({@link RULES}, one per rule of the lexer
 * jison generated, in its order), run on exactly the text v12's lexer saw ({@link v12Text}),
 * with every token mapped back to its source range (DESIGN §4.3). The source is never rewritten.
 * Comments and directives v12 removed before lexing, and the `%%` comments jison's own rules
 * skip, are trivia tokens with their own ranges, in source order.
 *
 * The rules are those of the lexer in mermaid 12.2.0's dist, which differ from what
 * `xychart.jison` seems to say: `vertical|horizontal` gets no trailing `\b` (the keywords do);
 * the three `md_string` rules are one rule matching their own source text (their opening quote
 * is never closed), so a markdown string never opens and a bare backtick is a lexical error; the
 * `accTitle`/`accDescr` values are `[^\n]*` (the `;|#` of the lookahead was lost); and the
 * `title` and `md_string` states are never entered.
 *
 * jison semantics kept: the first rule of the current state that matches wins (no longest
 * match); `axis_data`, `axis_band_data`, `data` and `data_inner` are inclusive (`%s`: the rules
 * with no state apply too), the other states exclusive; the lexer is case-insensitive (ASCII
 * letters only); a rule without a token still writes a v13 token for its match (the quotes,
 * `accDescr {`, blanks; the gate leaves them out); at the end of the text the rules are tried
 * once more (`<<EOF>>`, empty values), then lexing stops. Where jison would throw, v13 writes one `Error`
 * token (zero-width before a line break, else one code point), resets to the initial state and
 * carries on (for recovery).
 *
 * Every rule scans only the text it matches, plus a bounded look past it, so lexing is linear
 * in the text (R-PARSE-7, pitfall 5).
 */
// cspell:words acctitle accdescr xychart
import {
  AMP,
  codePointEnd,
  COLON,
  COMMA,
  CR,
  DASH,
  DOT,
  DQUOTE,
  EQUALS,
  GT,
  HASH,
  isDigit,
  isLetter,
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
  STAR,
  TokenWriter,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Hole, Probe, TokenStream } from '@mermaid-js/core/parser-kit';
import { T } from './tokens.ts';
import type { V12Text } from './v12-text.ts';

/** Start conditions of xychart.jison. */
const S = {
  INITIAL: 0,
  /** Exclusive and never entered: `title`'s text is lexed by the initial rules. */
  title: 1,
  acc_title: 2,
  acc_descr: 3,
  acc_descr_multiline: 4,
  /** Exclusive and never entered (the broken `md_string` rules). */
  md_string: 5,
  string: 6,
  axis_data: 7,
  axis_band_data: 8,
  data: 9,
  data_inner: 10,
} as const;

/** What a rule does to the start-condition stack. */
const A = {
  none: 0,
  /** `this.pushState(…)`. */
  begin: 1,
  /** `this.popState()`. */
  pop: 2,
} as const;

/** Start condition names by number, for the probe's lexer mode (jison's names). */
const S_NAMES: readonly string[] = Object.keys(S);

/**
 * Word kinds: a cursor right after one extends it (`tit¦`, `bar¦`), so the probe's mode there
 * is that of the step that lexed it, not of the next step (a keyword's data state).
 */
const MODE_WORD_KINDS = new Set<number>([
  T.XyChart,
  T.ChartOrientation,
  T.Title,
  T.XAxis,
  T.YAxis,
  T.Line,
  T.Bar,
  T.Alpha,
  T.Num,
  T.NumberWithDecimal,
]);

type Action = (typeof A)[keyof typeof A];
type State = (typeof S)[keyof typeof S];

/** A rule's pattern: the end of the match at `p`, or -1. */
interface Matcher {
  (x: Scan, p: number): number;
  /**
   * Whether a match can start with the character `c` (an ASCII code), for the dispatch table;
   * absent for a pattern that may match the empty string or any character.
   */
  first?: (c: number) => boolean;
}

/** `match`, known to start only with a character `first` accepts. */
const starting = (first: (c: number) => boolean, match: (x: Scan, p: number) => number): Matcher =>
  Object.assign(match, { first });

/** The first character of a case-insensitive literal (lower case). */
const firstOf = (word: string) => {
  const w = word.charCodeAt(0);
  return (c: number) => fold(c) === w;
};

interface Rule {
  /** End of the match at `p`, or -1. */
  readonly match: Matcher;
  /** The token kind written for the match (a trivia kind for the skipped comments). */
  readonly kind: number;
  readonly action: Action;
  /** The state `A.begin` enters. */
  readonly state: State;
}

/** The text being lexed and its length (appended `\n` included). */
interface Scan {
  readonly text: string;
  readonly n: number;
}

const PLUS = 0x2b;

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

/** A literal with jison's trailing `\b`. */
const keyword = (word: string): Matcher =>
  starting(firstOf(word), (x, p) => {
    const e = literal(x, word, p);
    return e < 0 || isWord(code(x, e)) ? -1 : e;
  });

/** A literal with no `\b` after it. */
const exact = (word: string): Matcher => starting(firstOf(word), (x, p) => literal(x, word, p));

/** `word\s*"c"\s*` (`accTitle:`, `accDescr:`, `accDescr {`). */
const wordThen = (word: string, c: number): Matcher =>
  starting(firstOf(word), (x, p) => {
    const e = literal(x, word, p);
    if (e < 0) return -1;
    const b = blanks(x, e);
    return code(x, b) === c ? blanks(x, b + 1) : -1;
  });

/** One character. */
const char = (c: number): Matcher =>
  starting(
    (d) => d === c,
    (x, p) => (code(x, p) === c ? p + 1 : -1)
  );

/** A non-empty run of characters `test` accepts. */
const run = (test: (c: number) => boolean): Matcher =>
  starting(test, (x, p) => {
    let j = p;
    while (j < x.n && test(x.text.charCodeAt(j))) j++;
    return j > p ? j : -1;
  });

/** `%%(?!\{)[^\n]*`. */
function comment(x: Scan, p: number): number {
  if (code(x, p) !== PERCENT || code(x, p + 1) !== PERCENT || code(x, p + 2) === LBRACE) return -1;
  return lineEnd(x, p + 2);
}

/** `[^\}]%%[^\n]*`: a comment that takes the character before it (a line break or `]` too). */
function commentAfter(x: Scan, p: number): number {
  if (p >= x.n || code(x, p) === RBRACE) return -1;
  if (code(x, p + 1) !== PERCENT || code(x, p + 2) !== PERCENT) return -1;
  return lineEnd(x, p + 3);
}

/** `%%[^\n]*`. */
function anyComment(x: Scan, p: number): number {
  return code(x, p) === PERCENT && code(x, p + 1) === PERCENT ? lineEnd(x, p + 2) : -1;
}

/** `\r?\n`. */
function lineBreak(x: Scan, p: number): number {
  const q = code(x, p) === CR ? p + 1 : p;
  return code(x, q) === LF ? q + 1 : -1;
}

/** `(?:vertical|horizontal)`, with no `\b`. */
function orientation(x: Scan, p: number): number {
  const e = literal(x, 'vertical', p);
  return e >= 0 ? e : literal(x, 'horizontal', p);
}

/** `-->`. */
function arrow(x: Scan, p: number): number {
  return code(x, p) === DASH && code(x, p + 1) === DASH && code(x, p + 2) === GT ? p + 3 : -1;
}

/** End of the run of digits from `p` (`p` when there is none). */
function digits(x: Scan, p: number): number {
  let j = p;
  while (j < x.n && isDigit(code(x, j))) j++;
  return j;
}

/** `[+-]?(?:\d+(?:\.\d+)?|\.\d+)`. */
function number(x: Scan, p: number): number {
  const sign = code(x, p);
  const s = sign === PLUS || sign === DASH ? p + 1 : p;
  const int = digits(x, s);
  if (int > s) {
    if (code(x, int) !== DOT) return int;
    const frac = digits(x, int + 1);
    return frac > int + 1 ? frac : int;
  }
  if (code(x, s) !== DOT) return -1;
  const frac = digits(x, s + 1);
  return frac > s + 1 ? frac : -1;
}

/**
 * The source text of `xychart.jison`'s three `md_string` rules from the opening backtick (its
 * lines 51–53), which jison read as one rule matching that text literally (lower case here).
 */
const DEAD_MD_RULE = (
  '`)' +
  ' '.repeat(36) +
  '{ this.pushState(md_string); }\n<md_string>(?:(?!`").)+' +
  ' '.repeat(18) +
  '{ return MD_STR; }\n<md_string>(?:`'
).toLowerCase();

const isNewline = (c: number) => c === LF || c === CR;
const isPercent = (c: number) => c === PERCENT;
const isOrientationStart = (c: number) => fold(c) === 0x76 || fold(c) === 0x68; // v, h
const isNumberStart = (c: number) => c === PLUS || c === DASH || c === DOT || isDigit(c);

const rule = (
  match: Rule['match'],
  kind: number,
  action: Action = A.none,
  state: State = S.INITIAL
): Rule => ({ match, kind, action, state });

/** The rules of the generated xychart lexer; index = its rule number (from 0). */
const RULES: readonly Rule[] = [
  /* 0 */ rule(starting(isPercent, comment), Kind.Comment),
  /* 1 */ rule(
    starting((c) => c !== RBRACE, commentAfter),
    Kind.Comment
  ),
  /* 2 */ rule(starting(isNewline, lineBreak), Kind.Newline, A.pop),
  /* 3 */ rule(starting(isNewline, lineBreak), Kind.Newline, A.pop),
  /* 4 */ rule(run(isNewline), Kind.Newline),
  /* 5 */ rule(starting(isPercent, anyComment), Kind.Comment),
  /* 6 */ rule(keyword('title'), T.Title),
  /* 7 */ rule(wordThen('acctitle', COLON), T.AccTitle, A.begin, S.acc_title),
  /* 8 */ rule(lineEnd, T.AccTitleValue, A.pop),
  /* 9 */ rule(wordThen('accdescr', COLON), T.AccDescr, A.begin, S.acc_descr),
  /* 10 */ rule(lineEnd, T.AccDescrValue, A.pop),
  /* 11 */ rule(wordThen('accdescr', LBRACE), T.AccDescrMultiline, A.begin, S.acc_descr_multiline),
  /* 12 */ rule(char(RBRACE), T.AccDescrMultilineEnd, A.pop),
  /* 13 */ rule((x, p) => until(x, '}', p), T.AccDescrMultilineValue),
  /* 14 */ rule(keyword('xychart-beta'), T.XyChart),
  /* 15 */ rule(keyword('xychart'), T.XyChart),
  /* 16 */ rule(starting(isOrientationStart, orientation), T.ChartOrientation),
  /* 17 */ rule(keyword('x-axis'), T.XAxis, A.begin, S.axis_data),
  /* 18 */ rule(keyword('y-axis'), T.YAxis, A.begin, S.axis_data),
  /* 19 */ rule(char(LBRACKET), T.SquareBracesStart, A.begin, S.axis_band_data),
  /* 20 */ rule(
    starting((c) => c === DASH, arrow),
    T.ArrowDelimiter
  ),
  /* 21 */ rule(keyword('line'), T.Line, A.begin, S.data),
  /* 22 */ rule(keyword('bar'), T.Bar, A.begin, S.data),
  /* 23 */ rule(char(LBRACKET), T.SquareBracesStart, A.begin, S.data_inner),
  /* 24 */ rule(starting(isNumberStart, number), T.NumberWithDecimal),
  /* 25 */ rule(char(RBRACKET), T.SquareBracesEnd, A.pop),
  /* 26 */ rule(exact(DEAD_MD_RULE), T.DeadMdRule, A.pop),
  /* 27 */ rule(char(DQUOTE), T.StringStart, A.begin, S.string),
  /* 28 */ rule(char(DQUOTE), T.StringEnd, A.pop),
  /* 29 */ rule((x, p) => until(x, '"', p), T.Str),
  /* 30 */ rule(char(LBRACKET), T.SquareBracesStart),
  /* 31 */ rule(char(RBRACKET), T.SquareBracesEnd),
  /* 32 */ rule(run(isLetter), T.Alpha),
  /* 33 */ rule(char(COLON), T.Colon),
  /* 34 */ rule(char(PLUS), T.Plus),
  /* 35 */ rule(char(COMMA), T.Comma),
  /* 36 */ rule(char(EQUALS), T.Equals),
  /* 37 */ rule(char(STAR), T.Mult),
  /* 38 */ rule(char(HASH), T.Brkt),
  /* 39 */ rule(char(UNDERSCORE), T.Underscore),
  /* 40 */ rule(char(DOT), T.Dot),
  /* 41 */ rule(char(AMP), T.Amp),
  /* 42 */ rule(char(DASH), T.Minus),
  /* 43 */ rule(run(isDigit), T.Num),
  /* 44 */ rule(run(isSpace), T.Blanks),
  /* 45 */ rule(char(SEMI), T.Semi),
  /* 46 */ rule(
    starting(
      () => false,
      (x, p) => (p === x.n ? p : -1)
    ),
    T.Eof
  ),
];

/**
 * The rules with no state, which the inclusive states share, in runs split where a state's own
 * rules go between them by rule number (as in the generated lexer's `conditions`): the comment
 * rules 0 and 1 (before the line-break rules 2 and 3 of `axis_data` and `data`), the keyword
 * rules up to `y-axis` (before 19 and 20 of `axis_data`), `line` and `bar` (before 23–25), and
 * the rest.
 */
const COMMENTS = [0, 1];
const KEYWORDS = [4, 5, 6, 7, 9, 11, 14, 15, 16, 17, 18];
const PLOTS = [21, 22];
const REST = [26, 27, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46];

/** Rule numbers of each start condition, in order (the generated lexer's `conditions`). */
const CONDITIONS: readonly (readonly number[])[] = [
  /* INITIAL */ [...COMMENTS, ...KEYWORDS, ...PLOTS, ...REST],
  /* title */ [],
  /* acc_title */ [8],
  /* acc_descr */ [10],
  /* acc_descr_multiline */ [12, 13],
  /* md_string */ [],
  /* string */ [28, 29],
  /* axis_data */ [...COMMENTS, 2, ...KEYWORDS, 19, 20, ...PLOTS, 24, ...REST],
  /* axis_band_data */ [...COMMENTS, ...KEYWORDS, ...PLOTS, 25, ...REST],
  /* data */ [...COMMENTS, 3, ...KEYWORDS, ...PLOTS, 23, ...REST],
  /* data_inner */ [...COMMENTS, ...KEYWORDS, ...PLOTS, 24, 25, ...REST],
];

/**
 * Per start condition and ASCII character, the rules of {@link CONDITIONS} that can match at a
 * position holding that character, in the same order: a rule whose pattern starts only with
 * other characters is left out, so the first match is the same. Past ASCII and at the end of
 * the text the full list applies.
 */
const DISPATCH: readonly (readonly (readonly number[])[])[] = CONDITIONS.map((list) =>
  Array.from({ length: 128 }, (_, c) =>
    list.filter((k) => {
      const first = (RULES[k] as Rule).match.first;
      return first === undefined || first(c);
    })
  )
);

/** A lex: the tokens (source offsets), and each token's range in v12's text. */
export interface XyChartLex {
  tokens: TokenStream;
  /** Start of token `i` in {@link V12Text.text}; trivia from removed spans get -1. */
  textStart: Int32Array;
  /** End of token `i` in {@link V12Text.text} (it may include the `\n` v12 appended). */
  textEnd: Int32Array;
  v12: V12Text;
}

/**
 * Lex an XY chart source as v12 saw it (`v12`), writing v12's removed spans as trivia. `onRule`
 * is told the rule number of every rule that matches (dev use: the rule-coverage gate). With a
 * `probe`, the start condition at the probe's offset is recorded as its mode (R-LANG-7).
 */
export function lex(
  src: string,
  v12: V12Text,
  onRule?: (rule: number) => void,
  probe?: Probe
): XyChartLex {
  return new XyChartLexer(src, v12, onRule).run(probe);
}

class XyChartLexer {
  private readonly scan: Scan;
  private readonly w: TokenWriter;
  private readonly starts: number[] = [];
  private readonly ends: number[] = [];
  private readonly stack: number[] = [];
  private state: number = S.INITIAL;
  private hole = 0;
  private readonly holes: readonly Hole[];

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

  run(probe?: Probe): XyChartLex {
    const { n } = this.scan;
    let p = 0;
    // Two loops, so a plain lex does no probe work per step.
    if (probe === undefined) {
      for (let done = false; !done; ) {
        if (p >= n) done = true;
        p = this.advance(p, this.step(p));
      }
    } else {
      for (let done = false; !done; ) {
        if (p >= n) done = true;
        const before = p;
        const mode = S_NAMES[this.state] ?? '';
        const k = this.step(p);
        p = this.advance(p, k);
        const start = this.sourceStart(before);
        let end = p > before ? this.sourceEnd(p - 1) : start;
        // The step holds an offset right after its word (`Probe.lexed` takes `end` exclusive).
        if (p > before && k >= 0 && MODE_WORD_KINDS.has((RULES[k] as Rule).kind)) end++;
        probe.lexed(start, end, mode);
      }
      probe.lexed(this.src.length, this.src.length, S_NAMES[this.state] ?? '');
    }
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

  /** Where the last matching step ended. */
  private matchEnd = 0;

  /**
   * The offset after the step at `p` that applied rule `k` (-1: none matched). Where jison would
   * throw, one `Error` token: zero-width before a line break, so the initial state lexes it;
   * else one code point, so the token never splits an emoji.
   */
  private advance(p: number, k: number): number {
    if (k >= 0) return this.matchEnd;
    if (p >= this.scan.n) return p;
    const c = this.scan.text.charCodeAt(p);
    const end = c === LF ? p : codePointEnd(this.scan.text, p);
    this.emit(Kind.Error, p, end);
    this.stack.length = 0;
    this.state = S.INITIAL;
    return end;
  }

  /**
   * Apply the first matching rule of the current state at `p` (through {@link DISPATCH} for an
   * ASCII character): the rule's number, its end in {@link matchEnd}; -1 when none matches.
   */
  private step(p: number): number {
    const { text, n } = this.scan;
    const c = p < n ? text.charCodeAt(p) : -1;
    const rules = c >= 0 && c < 128 ? DISPATCH[this.state]![c]! : CONDITIONS[this.state]!;
    for (const k of rules) {
      const r = RULES[k] as Rule;
      const e = r.match(this.scan, p);
      if (e < 0) continue;
      this.onRule?.(k);
      if (r.action === A.begin) {
        this.stack.push(this.state);
        this.state = r.state;
      } else if (r.action === A.pop) this.state = this.stack.pop() ?? S.INITIAL;
      this.emit(r.kind, p, e);
      this.matchEnd = e;
      return k;
    }
    return -1;
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
