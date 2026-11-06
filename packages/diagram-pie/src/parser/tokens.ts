/**
 * Pie token kinds. They mirror the terminals of v12's Langium `pie.langium` (with
 * `common.langium`), so the lexer can be checked token by token against its Chevrotain lexer
 * (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `showData` keyword. */
  ShowData: F,
  /** The `pie` keyword. */
  Pie: F + 1,
  Colon: F + 2,
  /** A slice value: `-?[0-9]+\.[0-9]+` or `-?(0|[1-9][0-9]*)`, never followed by `.`. */
  Number: F + 3,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 4,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 5,
  /** `title …` to `%%` or the line end, with the blanks before it. */
  Title: F + 6,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 7,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 8,
} as const;

/**
 * Trivia for the pie parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%` comments
 * are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12 removed
 * before lexing.
 */
export const PIE_TRIVIA = /* @__PURE__ */ kindSet(Kind.Comment, Kind.Directive, Kind.Space, T.Yaml);

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `LEXICAL_ERROR` marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.ShowData]: 'showData',
  [T.Pie]: 'pie',
  [T.Colon]: ':',
  [T.Number]: 'NUMBER_PIE',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.String]: 'STRING',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
