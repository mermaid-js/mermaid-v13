/**
 * Quadrant token kinds. They mirror the terminals of v12's `quadrant.jison`, so the lexer can
 * be checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums
 * are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `quadrantChart`, with the spaces around it (`" "*"quadrantChart"" "*`). */
  Quadrant: F,
  /** `title` (a keyword: `title\b`). */
  Title: F + 1,
  /** The rest of the line after `title`, as written (leading blanks and `%%` included). */
  TitleValue: F + 2,
  /** `accTitle:` with the blanks around the colon. */
  AccTitle: F + 3,
  AccTitleValue: F + 4,
  /** `accDescr:` with the blanks around the colon. */
  AccDescr: F + 5,
  AccDescrValue: F + 6,
  /** `accDescr {` (jison returns no token for it). */
  AccDescrMultiline: F + 7,
  AccDescrMultilineValue: F + 8,
  /** The `}` closing `accDescr {` (jison returns no token for it). */
  AccDescrMultilineEnd: F + 9,
  /** `x-axis`, with the spaces around it. */
  XAxis: F + 10,
  /** `y-axis`, with the spaces around it. */
  YAxis: F + 11,
  /** `-->` (two or more dashes), with the spaces around it. */
  AxisTextDelimiter: F + 12,
  Quadrant1: F + 13,
  Quadrant2: F + 14,
  Quadrant3: F + 15,
  Quadrant4: F + 16,
  /** `classDef` (a keyword: `classDef\b`). */
  ClassDef: F + 17,
  /** The opening quote and backtick of a markdown string (jison returns no token for it). */
  MdStringStart: F + 18,
  MdStr: F + 19,
  /** The closing backtick and quote of a markdown string (jison returns no token for it). */
  MdStringEnd: F + 20,
  /** The opening `"` of a string (jison returns no token for it). */
  StringStart: F + 21,
  Str: F + 22,
  /** The closing `"` of a string (jison returns no token for it). */
  StringEnd: F + 23,
  /** `:::` (jison returns no token for it). */
  ClassMarker: F + 24,
  /** The class name after `:::` (`\w+`). */
  ClassName: F + 25,
  /** `:` and `[`, with the blanks (line breaks too) around them. */
  PointStart: F + 26,
  /** The x coordinate, `(1)|(0(.\d+)?)` with the `.` unescaped. */
  PointX: F + 27,
  /** The `,` between the coordinates, with its blanks (jison returns no token for it). */
  PointComma: F + 28,
  PointY: F + 29,
  /** The closing `]` and the blanks around it (jison returns no token for it). */
  PointEnd: F + 30,
  Alpha: F + 31,
  /** A run of non-ASCII UTF-16 code units (`[^\x00-\x7F]+`). */
  UnicodeText: F + 32,
  Colon: F + 33,
  Plus: F + 34,
  Comma: F + 35,
  Equals: F + 36,
  Mult: F + 37,
  /** `#` (jison's `BRKT`). */
  Brkt: F + 38,
  Underscore: F + 39,
  Dot: F + 40,
  Amp: F + 41,
  Minus: F + 42,
  Num: F + 43,
  /** One `\s` character that no earlier rule took. */
  Space: F + 44,
  Semi: F + 45,
  Punctuation: F + 46,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 47,
} as const;

/**
 * The v12 `quadrant.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry match text for which jison returns no token; `LEXICAL_ERROR` marks where jison threw.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Quadrant]: 'QUADRANT',
  [T.Title]: 'title',
  [T.TitleValue]: 'title_value',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.XAxis]: 'X-AXIS',
  [T.YAxis]: 'Y-AXIS',
  [T.AxisTextDelimiter]: 'AXIS-TEXT-DELIMITER',
  [T.Quadrant1]: 'QUADRANT_1',
  [T.Quadrant2]: 'QUADRANT_2',
  [T.Quadrant3]: 'QUADRANT_3',
  [T.Quadrant4]: 'QUADRANT_4',
  [T.ClassDef]: 'CLASSDEF',
  [T.MdStr]: 'MD_STR',
  [T.Str]: 'STR',
  [T.ClassName]: 'class_name',
  [T.PointStart]: 'point_start',
  [T.PointX]: 'point_x',
  [T.PointY]: 'point_y',
  [T.Alpha]: 'ALPHA',
  [T.UnicodeText]: 'UNICODE_TEXT',
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
  [T.Space]: 'SPACE',
  [T.Semi]: 'SEMI',
  [T.Punctuation]: 'PUNCTUATION',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
