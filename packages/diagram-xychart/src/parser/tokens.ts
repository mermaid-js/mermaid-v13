// cspell:words verticalx
/**
 * XY chart token kinds. They mirror the terminals of v12's `xychart.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `xychart` or `xychart-beta` (keywords: a trailing `\b`). */
  XyChart: F,
  /** `vertical` or `horizontal`, with no `\b`: `verticalx` is this and `x`. */
  ChartOrientation: F + 1,
  /** `title` (a keyword: `title\b`). Its text is lexed as ordinary tokens. */
  Title: F + 2,
  /** `x-axis` (a keyword), which enters the `axis_data` state. */
  XAxis: F + 3,
  /** `y-axis` (a keyword), which enters the `axis_data` state. */
  YAxis: F + 4,
  /** `line` (a keyword), which enters the `data` state. */
  Line: F + 5,
  /** `bar` (a keyword), which enters the `data` state. */
  Bar: F + 6,
  /** `accTitle:` with the blanks around the colon. */
  AccTitle: F + 7,
  /** The rest of the line after `accTitle:` (`;` and `#` included). */
  AccTitleValue: F + 8,
  /** `accDescr:` with the blanks around the colon. */
  AccDescr: F + 9,
  AccDescrValue: F + 10,
  /** `accDescr {` with its blanks (jison returns no token for it). */
  AccDescrMultiline: F + 11,
  AccDescrMultilineValue: F + 12,
  /** The `}` closing `accDescr {` (jison returns no token for it). */
  AccDescrMultilineEnd: F + 13,
  /** `[` (in `axis_data` and `data` it also enters the bracket's state). */
  SquareBracesStart: F + 14,
  /** `]` (in `axis_band_data` and `data_inner` it also leaves the state). */
  SquareBracesEnd: F + 15,
  /** `-->` (in `axis_data` only). */
  ArrowDelimiter: F + 16,
  /** `[+-]?(\d+(\.\d+)?|\.\d+)` (in `axis_data` and `data_inner` only). */
  NumberWithDecimal: F + 17,
  /**
   * The literal text of v12's broken `md_string` rules (jison returns no token for it): their
   * opening quote is never closed, so the three rules became one rule matching their own source
   * text, and a markdown string never opens.
   */
  DeadMdRule: F + 18,
  /** The opening `"` of a string (jison returns no token for it). */
  StringStart: F + 19,
  /** The text of a string, `[^"]*`: line breaks included, possibly empty. */
  Str: F + 20,
  /** The closing `"` of a string (jison returns no token for it). */
  StringEnd: F + 21,
  Alpha: F + 22,
  Colon: F + 23,
  Plus: F + 24,
  Comma: F + 25,
  Equals: F + 26,
  Mult: F + 27,
  /** `#` (jison's `BRKT`). */
  Brkt: F + 28,
  Underscore: F + 29,
  Dot: F + 30,
  Amp: F + 31,
  Minus: F + 32,
  Num: F + 33,
  /** A run of `\s` no earlier rule took, line breaks included (jison skips it). */
  Blanks: F + 34,
  Semi: F + 35,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 36,
} as const;

/**
 * The v12 `xychart.jison` terminal each kind stands for (dev and test use: the lexer-parity gate
 * compares token streams by these names). Never shown to users (R-ERR-5). Kinds without an entry
 * match text for which jison returns no token; `LEXICAL_ERROR` marks where jison threw.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.XyChart]: 'XYCHART',
  [T.ChartOrientation]: 'CHART_ORIENTATION',
  [T.Title]: 'title',
  [T.XAxis]: 'X_AXIS',
  [T.YAxis]: 'Y_AXIS',
  [T.Line]: 'LINE',
  [T.Bar]: 'BAR',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.SquareBracesStart]: 'SQUARE_BRACES_START',
  [T.SquareBracesEnd]: 'SQUARE_BRACES_END',
  [T.ArrowDelimiter]: 'ARROW_DELIMITER',
  [T.NumberWithDecimal]: 'NUMBER_WITH_DECIMAL',
  [T.Str]: 'STR',
  [T.Alpha]: 'ALPHA',
  [T.Colon]: 'COLON',
  [T.Plus]: 'PLUS',
  [T.Comma]: 'COMMA',
  [T.Equals]: 'EQUALS',
  [T.Mult]: 'MULT',
  [T.Brkt]: 'BRKT',
  [T.Underscore]: 'UNDERSCORE',
  [T.Dot]: 'DOT',
  [T.Amp]: 'AMP',
  [T.Minus]: 'MINUS',
  [T.Num]: 'NUM',
  [T.Semi]: 'SEMI',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
