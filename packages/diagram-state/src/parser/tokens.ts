/**
 * State token kinds. They mirror the terminals of v12's `stateDiagram.jison`, so the lexer can
 * be checked token by token against it (#138). Kinds marked "no terminal" cover text jison
 * consumes without returning a token; they keep every non-blank character in a token for
 * editors. Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `stateDiagram` / `stateDiagram-v2` with the blanks after it. */
  Sd: F,
  /** The end of the text in the initial state (jison's `<<EOF>>` rule returns `NL`). */
  EndOfInput: F + 1,
  Click: F + 2,
  Href: F + 3,
  String: F + 4,
  Default: F + 5,
  DirectionTB: F + 6,
  DirectionBT: F + 7,
  DirectionRL: F + 8,
  DirectionLR: F + 9,
  Scale: F + 10,
  Width: F + 11,
  /** `width` after `scale N` (no terminal). */
  ScaleWidth: F + 12,
  AccTitle: F + 13,
  AccTitleValue: F + 14,
  AccDescr: F + 15,
  AccDescrValue: F + 16,
  /** `accDescr {` (no terminal). */
  AccDescrOpen: F + 17,
  AccDescrMultilineValue: F + 18,
  /** The `}` closing a multi-line `accDescr` (no terminal). */
  AccDescrClose: F + 19,
  ClassDef: F + 20,
  DefaultClassDefId: F + 21,
  ClassDefId: F + 22,
  ClassDefStyleOpts: F + 23,
  Class: F + 24,
  ClassEntityIds: F + 25,
  StyleClass: F + 26,
  Style: F + 27,
  StyleIds: F + 28,
  StyleDefStyleOpts: F + 29,
  /** The `state` keyword (no terminal). */
  State: F + 30,
  Fork: F + 31,
  Join: F + 32,
  Choice: F + 33,
  /** `<<fork>>`, `[[join]]`, … after a fork, join or choice name (no terminal). */
  Marker: F + 34,
  /** A `"` around a state description or a floating note (no terminal). */
  Quote: F + 35,
  As: F + 36,
  Id: F + 37,
  StateDescr: F + 38,
  CompositeState: F + 39,
  /** `state a b {`: v12's lexer throws "State name must be a single word". */
  MultiWordState: F + 40,
  StructStart: F + 41,
  StructStop: F + 42,
  Note: F + 43,
  LeftOf: F + 44,
  RightOf: F + 45,
  NoteText: F + 46,
  /** `end note` closing a multi-line note (no terminal). */
  EndNote: F + 47,
  HideEmpty: F + 48,
  EdgeState: F + 49,
  Descr: F + 50,
  Arrow: F + 51,
  Concurrent: F + 52,
  StyleSeparator: F + 53,
  /** A character jison's catch-all `.` rule returns as `INVALID`. */
  Invalid: F + 54,
  /** `mermaid` opening an embedded diagram block (ADR-15): only on a line ending in `{`. */
  Embed: F + 55,
  /** A block's id, after `mermaid`. */
  EmbedId: F + 56,
  /** A block's `["Title"]`, brackets and quotes included. */
  EmbedTitle: F + 57,
  /** The `{` ending a block's opening line. */
  EmbedOpen: F + 58,
  /** A block's body, verbatim: from the line after the opener to its closing line. */
  EmbedBody: F + 59,
  /** The `}` that closes a block, first on its line. */
  EmbedEnd: F + 60,
  /** `@{ … }` after a block id, folding the block (#670): up to the first `}` on the line. */
  EmbedFold: F + 61,
} as const;
