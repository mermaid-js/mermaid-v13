/**
 * gitGraph token kinds. They mirror the terminals of v12's Langium `gitGraph.langium` (with
 * `common.langium` and `reference.langium`), so the lexer can be checked token by token against
 * its Chevrotain lexer (parser-method §1, D213, D262). Kinds are plain numbers (TS enums are
 * banned), listed in Chevrotain's match order.
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `cherry-pick` keyword. */
  CherryPick: F,
  /** `gitGraph:`, one token (no boundary after it). */
  GitGraphColon: F + 1,
  Highlight: F + 2,
  /** The `gitGraph` keyword: only before a blank, `%%` or the end. */
  GitGraph: F + 3,
  Checkout: F + 4,
  Reverse: F + 5,
  /** `parent:`. */
  Parent: F + 6,
  Commit: F + 7,
  Normal: F + 8,
  Branch: F + 9,
  /** `order:`. */
  Order: F + 10,
  Switch: F + 11,
  /** `type:`. */
  Type: F + 12,
  Merge: F + 13,
  /** `msg:`. */
  Msg: F + 14,
  /** `tag:`. */
  Tag: F + 15,
  /** `id:`. */
  Id: F + 16,
  LR: F + 17,
  TB: F + 18,
  BT: F + 19,
  Colon: F + 20,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 21,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 22,
  /** `title`, then a blank and the line to `%%` or its end, with the blanks before it. */
  Title: F + 23,
  /** `0`, or `[1-9][0-9]*` not followed by `.` (the regex gives up a digit to get there). */
  Int: F + 24,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 25,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 26,
  /** A name: `\w([-./\w]*[-\w])?`. A word keyword yields to it where it is longer. */
  Reference: F + 27,
} as const;

/**
 * Trivia for the gitGraph parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const GITGRAPH_TRIVIA = /* @__PURE__ */ kindSet(
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
  [T.CherryPick]: 'cherry-pick',
  [T.GitGraphColon]: 'gitGraph:',
  [T.Highlight]: 'HIGHLIGHT',
  [T.GitGraph]: 'gitGraph',
  [T.Checkout]: 'checkout',
  [T.Reverse]: 'REVERSE',
  [T.Parent]: 'parent:',
  [T.Commit]: 'commit',
  [T.Normal]: 'NORMAL',
  [T.Branch]: 'branch',
  [T.Order]: 'order:',
  [T.Switch]: 'switch',
  [T.Type]: 'type:',
  [T.Merge]: 'merge',
  [T.Msg]: 'msg:',
  [T.Tag]: 'tag:',
  [T.Id]: 'id:',
  [T.LR]: 'LR',
  [T.TB]: 'TB',
  [T.BT]: 'BT',
  [T.Colon]: ':',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.Int]: 'INT',
  [T.String]: 'STRING',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [T.Reference]: 'REFERENCE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
