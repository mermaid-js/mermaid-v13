/**
 * Radar token kinds. They mirror the terminals and keywords of v12's Langium `radar.langium`
 * (with `common.langium`), so the lexer can be checked token by token against its Chevrotain
 * lexer (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** The `radar-beta:` header keyword (no boundary). */
  RadarBetaColon: F,
  /** The `radar-beta` header keyword, followed by a blank, `%%` or the end. */
  RadarBeta: F + 1,
  /** The `showLegend` keyword. Like every word keyword, a longer name wins over it. */
  ShowLegend: F + 2,
  /** The `graticule` keyword. */
  Graticule: F + 3,
  /** The `curve` keyword. */
  Curve: F + 4,
  /** The `ticks` keyword. */
  Ticks: F + 5,
  /** The `axis` keyword. */
  Axis: F + 6,
  /** The `max` keyword. */
  Max: F + 7,
  /** The `min` keyword. */
  Min: F + 8,
  Colon: F + 9,
  Comma: F + 10,
  LBracket: F + 11,
  RBracket: F + 12,
  LBrace: F + 13,
  RBrace: F + 14,
  /** `circle` or `polygon`, even at the start of a longer name (`circles`, D357). */
  GraticuleValue: F + 15,
  /** `true` or `false`, even at the start of a longer name. */
  Boolean: F + 16,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`, with the blanks before it. */
  AccDescr: F + 17,
  /** `accTitle: …` to `%%` or the line end, with the blanks before it. */
  AccTitle: F + 18,
  /** `title …` to `%%` or the line end (or `title` alone), with the blanks before it. */
  Title: F + 19,
  /** `[0-9]+\.[0-9]+` not followed by `.`, or `0`, or `[1-9][0-9]*` not followed by `.`. */
  Number: F + 20,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 21,
  /** A name: `[\w]([-\w]*\w)?`, ASCII only. */
  Id: F + 22,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 23,
} as const;

/**
 * Trivia for the radar parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const RADAR_TRIVIA = /* @__PURE__ */ kindSet(
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
  [T.RadarBetaColon]: 'radar-beta:',
  [T.RadarBeta]: 'radar-beta',
  [T.ShowLegend]: 'showLegend',
  [T.Graticule]: 'graticule',
  [T.Curve]: 'curve',
  [T.Ticks]: 'ticks',
  [T.Axis]: 'axis',
  [T.Max]: 'max',
  [T.Min]: 'min',
  [T.Colon]: ':',
  [T.Comma]: ',',
  [T.LBracket]: '[',
  [T.RBracket]: ']',
  [T.LBrace]: '{',
  [T.RBrace]: '}',
  [T.GraticuleValue]: 'GRATICULE',
  [T.Boolean]: 'BOOLEAN',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.Number]: 'NUMBER',
  [T.String]: 'STRING',
  [T.Id]: 'ID',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
