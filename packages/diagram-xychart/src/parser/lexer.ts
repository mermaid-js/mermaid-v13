/**
 * XY chart lexer: v12's `xychart.jison` lexer rules ({@link RULES}, one per rule of the lexer
 * jison generated, in its order), run by the shared table lexer on exactly the text v12's lexer
 * saw ({@link v12Text}), with every token mapped back to its source range (DESIGN §4.3). The source is never rewritten.
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
  Kind,
  LBRACE,
  LBRACKET,
  LF,
  PLUS,
  RBRACE,
  RBRACKET,
  SEMI,
  STAR,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Probe } from '@mermaid-js/core/parser-kit';
import {
  A,
  anyComment,
  char,
  code,
  comment,
  commentAfter,
  exact,
  fold,
  keyword,
  lexTable,
  lineEnd,
  literal,
  rule,
  run,
  starting,
  tableGrammar,
  until,
  wordThen,
} from '@mermaid-js/shared/parser/table';
import type { Matcher, Rule, Scan } from '@mermaid-js/shared/parser/table';
import type { V12Lex, V12Text } from '@mermaid-js/shared/parser/v12-text';
import { T } from './tokens.ts';

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

/** Start condition names by number, for the probe's lexer mode (jison's names). */
const S_NAMES: readonly string[] = Object.keys(S);

/**
 * Word kinds: a cursor right after one extends it (`tit¦`, `bar¦`), so the probe's mode there
 * is that of the step that lexed it, not of the next step (a keyword's data state).
 */
const MODE_WORD_KINDS = [
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
];

const isNewline = (c: number) => c === LF || c === CR;

/** `\r?\n`. */
const lineBreak: Matcher = starting(isNewline, (x, p) => {
  const q = code(x, p) === CR ? p + 1 : p;
  return code(x, q) === LF ? q + 1 : -1;
});

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

const isOrientationStart = (c: number) => fold(c) === 0x76 || fold(c) === 0x68; // v, h
const isNumberStart = (c: number) => c === PLUS || c === DASH || c === DOT || isDigit(c);

/** The rules of the generated xychart lexer; index = its rule number (from 0). */
const RULES: readonly Rule[] = [
  /* 0 */ rule(comment, Kind.Comment),
  /* 1 */ rule(commentAfter, Kind.Comment),
  /* 2 */ rule(lineBreak, Kind.Newline, A.pop),
  /* 3 */ rule(lineBreak, Kind.Newline, A.pop),
  /* 4 */ rule(run(isNewline), Kind.Newline),
  /* 5 */ rule(anyComment, Kind.Comment),
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

const GRAMMAR = /* @__PURE__ */ tableGrammar(RULES, CONDITIONS, S_NAMES, MODE_WORD_KINDS);

/** A lex: the tokens (source offsets), and each token's range in v12's text. */
export type XyChartLex = V12Lex;

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
  return lexTable(src, v12, GRAMMAR, onRule, probe);
}
