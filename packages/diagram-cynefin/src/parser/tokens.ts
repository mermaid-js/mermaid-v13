/**
 * Cynefin token kinds. They mirror the terminals of v12's Langium `cynefin.langium` (with
 * `common.langium`), so the lexer can be checked token by token against its Chevrotain lexer
 * (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `cynefin-beta:` header, a plain literal: anything may follow it. */
  HeaderColon: F,
  /** The `cynefin-beta` header, followed by `%%`, a blank or the end. */
  Header: F + 1,
  /** `-->`. */
  Arrow: F + 2,
  Colon: F + 3,
  /** `complex`, `complicated`, `clear`, `chaotic` or `confusion`, with no word boundary. */
  DomainName: F + 4,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 5,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 6,
  /** `title …` to `%%` or the line end, with the blanks before it. */
  Title: F + 7,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 8,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 9,
} as const;

/**
 * Trivia for the cynefin parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const CYNEFIN_TRIVIA = /* @__PURE__ */ kindSet(
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
  [T.HeaderColon]: 'cynefin-beta:',
  [T.Header]: 'cynefin-beta',
  [T.Arrow]: '-->',
  [T.Colon]: ':',
  [T.DomainName]: 'DOMAIN_NAME',
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
