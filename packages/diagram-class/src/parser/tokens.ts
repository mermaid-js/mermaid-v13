/**
 * Class-diagram token kinds. They mirror the terminals of v12's `classDiagram.jison`, so the
 * lexer can be checked token by token against it. Kinds are plain numbers (TS enums are banned).
 * Line breaks use the shared `Kind.Newline`, comments `Kind.Comment`, bad input `Kind.Error`.
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  DirectionTB: F,
  DirectionBT: F + 1,
  DirectionRL: F + 2,
  DirectionLR: F + 3,
  AccTitle: F + 4,
  AccTitleValue: F + 5,
  AccDescr: F + 6,
  AccDescrValue: F + 7,
  AccDescrMultilineValue: F + 8,
  /** `classDiagram` or `classDiagram-v2` (D101). */
  ClassDiagram: F + 9,
  /** `[*]`. */
  EdgeState: F + 10,
  CallbackName: F + 11,
  CallbackArgs: F + 12,
  /** The text of a `"…"` string, quotes left out. */
  Str: F + 13,
  Style: F + 14,
  ClassDef: F + 15,
  Namespace: F + 16,
  /** `{` opening a class or namespace body. */
  StructStart: F + 17,
  /** `}` closing a class or namespace body. */
  StructStop: F + 18,
  /** The end of the text inside an unclosed body (empty). */
  EofInStruct: F + 19,
  Class: F + 20,
  /** `{` inside a class body. */
  OpenInStruct: F + 21,
  /** One line of a class body. */
  Member: F + 22,
  CssClass: F + 23,
  Callback: F + 24,
  Link: F + 25,
  Click: F + 26,
  NoteFor: F + 27,
  Note: F + 28,
  AnnotationStart: F + 29,
  AnnotationEnd: F + 30,
  Href: F + 31,
  /** The text of a `~…~` generic, tildes left out. */
  GenericType: F + 32,
  /** The text of a backtick-quoted name, backticks left out. */
  BquoteStr: F + 33,
  LinkTarget: F + 34,
  /** `<|` or `|>`. */
  Extension: F + 35,
  /** `<` or `>`. */
  Dependency: F + 36,
  Composition: F + 37,
  Aggregation: F + 38,
  Lollipop: F + 39,
  /** `--`. */
  Line: F + 40,
  /** `..`. */
  DottedLine: F + 41,
  /** `: …` up to a `:`, `;` or line break. */
  Label: F + 42,
  /** `:::`. */
  StyleSeparator: F + 43,
  Minus: F + 44,
  Dot: F + 45,
  Plus: F + 46,
  Colon: F + 47,
  Comma: F + 48,
  /** `#`. */
  Brkt: F + 49,
  Pct: F + 50,
  Equals: F + 51,
  /** A run of `\w`. */
  Alpha: F + 52,
  SQS: F + 53,
  SQE: F + 54,
  Punctuation: F + 55,
  Num: F + 56,
  UnicodeText: F + 57,
  /** One significant blank. */
  Space: F + 58,
  /** jison's `EOF` token: the end of the text in a state with an end rule. */
  Eof: F + 59,
} as const;
