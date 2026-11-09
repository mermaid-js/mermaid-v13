/**
 * Architecture token kinds. They mirror the terminals and keywords of v12's Langium
 * `architecture.langium` (with `arch.langium` and `common.langium`), so the lexer can be checked
 * token by token against its Chevrotain lexer (parser-method §1, D213). Kinds are plain numbers
 * (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `architecture-beta` header keyword. No boundary, but a longer ID wins over it. */
  ArchitectureBeta: F,
  /** The `junction` keyword. Like every word keyword, a longer ID wins over it. */
  Junction: F + 1,
  Service: F + 2,
  Column: F + 3,
  Group: F + 4,
  Align: F + 5,
  Row: F + 6,
  /** `--`, unless a YAML block starts there. */
  DashDash: F + 7,
  In: F + 8,
  Colon: F + 9,
  /** `-` that starts no `--` or YAML block (the ends of `-[label]-`). */
  Dash: F + 10,
  /** `L`, `R`, `T` or `B` (ARROW_DIRECTION), even at the start of a name (`Backend`). */
  Direction: F + 11,
  /** `{group}` (ARROW_GROUP). */
  ArrowGroup: F + 12,
  /** `<` or `>` (ARROW_INTO). */
  ArrowInto: F + 13,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 14,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 15,
  /** `title …` to `%%` or the line end (or `title` alone), with the blanks before it. */
  Title: F + 16,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end (a text icon). */
  String: F + 17,
  /** `[\w]([-\w]*\w)?`, ASCII only. */
  Id: F + 18,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 19,
  /** `(` `[\w:-]+` `)` (ARCH_ICON). */
  Icon: F + 20,
  /** `[` a quoted string, or a run with no bracket or line break, `]` (ARCH_TITLE). */
  Label: F + 21,
} as const;

/**
 * The word keywords, in Chevrotain's order (longest first, as Langium sorts them, with `--`
 * between `row` and `in`; none starts another, so the order never decides); each gives
 * way to an ID that matches longer (`services`, `rows`, `inx`), never to one of equal length.
 */
export const KEYWORDS: readonly (readonly [word: string, kind: number])[] = [
  ['architecture-beta', T.ArchitectureBeta],
  ['junction', T.Junction],
  ['service', T.Service],
  ['column', T.Column],
  ['group', T.Group],
  ['align', T.Align],
  ['row', T.Row],
  ['in', T.In],
];

/**
 * Trivia for the architecture parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const ARCHITECTURE_TRIVIA = /* @__PURE__ */ kindSet(
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
  [T.ArchitectureBeta]: 'architecture-beta',
  [T.Junction]: 'junction',
  [T.Service]: 'service',
  [T.Column]: 'column',
  [T.Group]: 'group',
  [T.Align]: 'align',
  [T.Row]: 'row',
  [T.DashDash]: '--',
  [T.In]: 'in',
  [T.Colon]: ':',
  [T.Dash]: '-',
  [T.Direction]: 'ARROW_DIRECTION',
  [T.ArrowGroup]: 'ARROW_GROUP',
  [T.ArrowInto]: 'ARROW_INTO',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.String]: 'STRING',
  [T.Id]: 'ID',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [T.Icon]: 'ARCH_ICON',
  [T.Label]: 'ARCH_TITLE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
