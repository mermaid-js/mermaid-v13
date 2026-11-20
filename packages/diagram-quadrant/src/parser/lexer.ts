/**
 * Quadrant lexer: v12's `quadrant.jison` lexer rules ({@link RULES}, one per jison rule, in
 * jison's order), run by the shared table lexer on exactly the text v12's lexer saw
 * (`v12Text`), with every token mapped back to its source range (DESIGN §4.3). The source is
 * never rewritten. Comments and directives v12 removed before lexing, and the `%%` comments
 * jison's own rules skip, are trivia tokens with their own ranges, in source order.
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
  PLUS,
  QUESTION,
  RBRACE,
  RBRACKET,
  SEMI,
  SLASH,
  SPACE,
  STAR,
  UNDERSCORE,
} from '@mermaid-js/core/parser-kit';
import type { Probe } from '@mermaid-js/core/parser-kit';
import {
  A,
  anyComment,
  blanks,
  char,
  code,
  comment,
  commentAfter,
  keyword,
  lexTable,
  lineEnd,
  literal,
  rule,
  run,
  tableGrammar,
  until,
  wordThen,
} from '@mermaid-js/shared/parser/table';
import type { Rule, Scan } from '@mermaid-js/shared/parser/table';
import type { V12Lex, V12Text } from '@mermaid-js/shared/parser/v12-text';
import { T } from './tokens.ts';

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
const WORD_KINDS = [T.Title, T.ClassDef, T.Alpha, T.Num, T.UnicodeText, T.ClassName];

const EXCLAMATION = 0x21;
const DOLLAR = 0x24;
const APOSTROPHE = 0x27;

/** End of the run of U+0020 from `p` (`" "*`). */
function spaces(x: Scan, p: number): number {
  let j = p;
  while (j < x.n && x.text.charCodeAt(j) === SPACE) j++;
  return j;
}

/** `" "*"word"" "*`. */
const padded =
  (word: string) =>
  (x: Scan, p: number): number => {
    const e = literal(x, word, spaces(x, p));
    return e < 0 ? -1 : spaces(x, e);
  };

/** Two characters. */
const pair =
  (a: number, b: number) =>
  (x: Scan, p: number): number =>
    code(x, p) === a && code(x, p + 1) === b ? p + 2 : -1;

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

const GRAMMAR = /* @__PURE__ */ tableGrammar(RULES, CONDITIONS, S_NAMES, WORD_KINDS);

/** A lex: the tokens (source offsets), and each token's range in v12's text. */
export type QuadrantLex = V12Lex;

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
  return lexTable(src, v12, GRAMMAR, onRule, probe);
}
