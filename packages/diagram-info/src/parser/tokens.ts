/**
 * Info token kinds. They mirror the terminals of v12's Langium `info.langium` (with
 * `common.langium`), so the lexer can be checked token by token against its Chevrotain lexer
 * (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `showInfo` keyword. */
  ShowInfo: F,
  /** The `info` keyword. */
  Info: F + 1,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 2,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 3,
  /** `title …` to `%%` or the line end, with the blanks before it. */
  Title: F + 4,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 5,
} as const;

/**
 * Trivia for the info parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%` comments
 * are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12 removed
 * before lexing.
 */
export const INFO_TRIVIA = /* @__PURE__ */ kindSet(
  Kind.Comment,
  Kind.Directive,
  Kind.Space,
  T.Yaml
);

/**
 * The Chevrotain token type each kind stands for in `@mermaid-js/parser@2.0.1` (dev and test
 * use: the lexer-parity gate compares token streams by these names). Never shown to users
 * (R-ERR-5). `LEXICAL_ERROR` marks where Chevrotain's lexer reports an error.
 */
export const LANGIUM_NAMES: Readonly<Record<number, string>> = {
  [T.ShowInfo]: 'showInfo',
  [T.Info]: 'info',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
