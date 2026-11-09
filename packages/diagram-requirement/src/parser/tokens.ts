// cspell:words VERIFYMTHD DOCREF CLASSDEF BRKT
/**
 * Requirement token kinds. They mirror the terminals of v12's `requirementDiagram.jison`, so
 * the lexer can be checked token by token against it (parser-method §1). Kinds are plain
 * numbers (TS enums are banned). Keywords are case-insensitive and end in `\b`.
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `title`, one `\s` (a line break too), then `[^#\n;]+`: the whole token. No rule takes it. */
  Title: F,
  /** `accTitle\s*:\s*` (the blanks and line breaks after the colon too). */
  AccTitle: F + 1,
  /** `[^\n]*` after {@link AccTitle}, untrimmed (possibly empty). */
  AccTitleValue: F + 2,
  /** `accDescr\s*:\s*`. */
  AccDescr: F + 3,
  /** `[^\n]*` after {@link AccDescr}, untrimmed (possibly empty). */
  AccDescrValue: F + 4,
  /** `accDescr\s*\{\s*` (jison returns no token for it). */
  AccDescrOpen: F + 5,
  /** `[^\}]*` inside `accDescr { … }`, line breaks included. */
  AccDescrMultilineValue: F + 6,
  /** The `}` closing `accDescr { … }` (jison returns no token for it). */
  AccDescrClose: F + 7,
  /**
   * `direction`, blanks and `TB`, `BT`, `RL` or `LR` (then `\b`) at the start of a line (D432),
   * nothing else of the line (v12's `.*direction\s+XX[^\n]*` took all of it, anywhere).
   */
  DirectionTB: F + 8,
  DirectionBT: F + 9,
  DirectionRL: F + 10,
  DirectionLR: F + 11,
  /**
   * A run of line breaks right after a blank run that follows other text on its line (D431).
   * v12's `\s+` swallowed it with the blanks, so jison returned no `NEWLINE` there; the parser
   * can take it as one only where the grammar needs a line break.
   */
  NewlineAfterBlank: F + 12,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text in the initial state. */
  Eof: F + 13,
  /** `requirementDiagram`. */
  Rd: F + 14,
  StructStart: F + 15,
  StructStop: F + 16,
  /** `:::`. */
  StyleSeparator: F + 17,
  /** `:` outside a style statement. */
  ColonSep: F + 18,
  Id: F + 19,
  Text: F + 20,
  Risk: F + 21,
  VerifyMethod: F + 22,
  Requirement: F + 23,
  FunctionalRequirement: F + 24,
  InterfaceRequirement: F + 25,
  PerformanceRequirement: F + 26,
  PhysicalRequirement: F + 27,
  DesignConstraint: F + 28,
  LowRisk: F + 29,
  MedRisk: F + 30,
  HighRisk: F + 31,
  VerifyAnalysis: F + 32,
  VerifyDemonstration: F + 33,
  VerifyInspection: F + 34,
  VerifyTest: F + 35,
  Element: F + 36,
  Contains: F + 37,
  Copies: F + 38,
  Derives: F + 39,
  Satisfies: F + 40,
  Verifies: F + 41,
  Refines: F + 42,
  Traces: F + 43,
  Type: F + 44,
  DocRef: F + 45,
  /** `style`, `classDef` and `class` each begin the style state. */
  Style: F + 46,
  ClassDef: F + 47,
  Class: F + 48,
  EndArrowL: F + 49,
  EndArrowR: F + 50,
  Line: F + 51,
  /** A `"` that opens or closes a quoted string (jison returns no token for it). */
  Quote: F + 52,
  /**
   * `[^"]*` inside quotes, line breaks included, no escapes. A text that ends inside quotes
   * ends with a zero-width one, as jison's empty match there.
   */
  QString: F + 53,
  /** `[\w][^:,\r\n\{\<\>\-\=]*`; its range and text are trimmed (jison's `yytext.trim()`). */
  UnqString: F + 54,
  /** `\w+` in a style statement. */
  Alpha: F + 55,
  Comma: F + 56,
  /** `:` in a style statement. */
  Colon: F + 57,
  Semicolon: F + 58,
  /** `%` in a style statement (jison returns the bare name `PERCENT`). */
  Percent: F + 59,
  Minus: F + 60,
  /** `#` in a style statement. */
  Brkt: F + 61,
  /** The line break that ends a style statement (jison pops the state and returns no token). */
  StyleEnd: F + 62,
} as const;

/**
 * The v12 `requirementDiagram.jison` terminal each kind stands for (dev and test use: the
 * lexer-parity gate compares token streams by these names). Never shown to users (R-ERR-5).
 * Kinds without an entry have no jison token; `LEXICAL_ERROR` marks where jison threw. A run of
 * line breaks is the shared `Kind.Newline`; the `#…` and `%…` comments jison skips are the
 * shared `Kind.Comment`. `<*>[0-9]+` (`NUM`) never matches: `\w+` comes first in every state.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Title]: 'title',
  [T.AccTitle]: 'acc_title',
  [T.AccTitleValue]: 'acc_title_value',
  [T.AccDescr]: 'acc_descr',
  [T.AccDescrValue]: 'acc_descr_value',
  [T.AccDescrMultilineValue]: 'acc_descr_multiline_value',
  [T.DirectionTB]: 'direction_tb',
  [T.DirectionBT]: 'direction_bt',
  [T.DirectionRL]: 'direction_rl',
  [T.DirectionLR]: 'direction_lr',
  [T.NewlineAfterBlank]: 'NEWLINE',
  [T.Eof]: 'EOF',
  [T.Rd]: 'RD',
  [T.StructStart]: 'STRUCT_START',
  [T.StructStop]: 'STRUCT_STOP',
  [T.StyleSeparator]: 'STYLE_SEPARATOR',
  [T.ColonSep]: 'COLONSEP',
  [T.Id]: 'ID',
  [T.Text]: 'TEXT',
  [T.Risk]: 'RISK',
  [T.VerifyMethod]: 'VERIFYMTHD',
  [T.Requirement]: 'REQUIREMENT',
  [T.FunctionalRequirement]: 'FUNCTIONAL_REQUIREMENT',
  [T.InterfaceRequirement]: 'INTERFACE_REQUIREMENT',
  [T.PerformanceRequirement]: 'PERFORMANCE_REQUIREMENT',
  [T.PhysicalRequirement]: 'PHYSICAL_REQUIREMENT',
  [T.DesignConstraint]: 'DESIGN_CONSTRAINT',
  [T.LowRisk]: 'LOW_RISK',
  [T.MedRisk]: 'MED_RISK',
  [T.HighRisk]: 'HIGH_RISK',
  [T.VerifyAnalysis]: 'VERIFY_ANALYSIS',
  [T.VerifyDemonstration]: 'VERIFY_DEMONSTRATION',
  [T.VerifyInspection]: 'VERIFY_INSPECTION',
  [T.VerifyTest]: 'VERIFY_TEST',
  [T.Element]: 'ELEMENT',
  [T.Contains]: 'CONTAINS',
  [T.Copies]: 'COPIES',
  [T.Derives]: 'DERIVES',
  [T.Satisfies]: 'SATISFIES',
  [T.Verifies]: 'VERIFIES',
  [T.Refines]: 'REFINES',
  [T.Traces]: 'TRACES',
  [T.Type]: 'TYPE',
  [T.DocRef]: 'DOCREF',
  [T.Style]: 'STYLE',
  [T.ClassDef]: 'CLASSDEF',
  [T.Class]: 'CLASS',
  [T.EndArrowL]: 'END_ARROW_L',
  [T.EndArrowR]: 'END_ARROW_R',
  [T.Line]: 'LINE',
  [T.QString]: 'qString',
  [T.UnqString]: 'unqString',
  [T.Alpha]: 'ALPHA',
  [T.Comma]: 'COMMA',
  [T.Colon]: 'COLON',
  [T.Semicolon]: 'SEMICOLON',
  [T.Percent]: 'PERCENT',
  [T.Minus]: 'MINUS',
  [T.Brkt]: 'BRKT',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
