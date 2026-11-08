/**
 * Wardley token kinds. They mirror the terminals and keywords of v12's Langium `wardley.langium`
 * (with `common.langium`), so the lexer can be checked token by token against its Chevrotain
 * lexer (parser-method §1, D213). Kinds are plain numbers (TS enums are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  LBracket: F,
  Comma: F + 1,
  RBracket: F + 2,
  At: F + 3,
  Slash: F + 4,
  LParen: F + 5,
  RParen: F + 6,
  /** A `-` that starts no `->`, `-->`, `-.->` or YAML block (label offsets: `[-60, 35]`). */
  Dash: F + 7,
  LBrace: F + 8,
  RBrace: F + 9,
  /** `[0-9]+\.[0-9]+`: a decimal, never an integer (`WARDLEY_NUMBER`). */
  Decimal: F + 10,
  /** `->`. */
  Arrow: F + 11,
  /** `+<>`, `+>` or `+<`. */
  LinkPort: F + 12,
  /** `-->`, `-.->`, `>`, or `+'…'` then `<>`, `<` or `>`. */
  LinkArrow: F + 13,
  /** `;` and the rest of the line (at least one character). */
  LinkLabel: F + 14,
  /** `build`, `buy`, `outsource` or `market`, even at the start of a longer name (D423). */
  Strategy: F + 15,
  /** The `wardley-beta` header keyword. Like every keyword below, it has no word boundary. */
  WardleyBeta: F + 16,
  Size: F + 17,
  Evolution: F + 18,
  Anchor: F + 19,
  Component: F + 20,
  Label: F + 21,
  Inertia: F + 22,
  Evolve: F + 23,
  Pipeline: F + 24,
  Note: F + 25,
  Annotations: F + 26,
  Annotation: F + 27,
  Accelerator: F + 28,
  Deaccelerator: F + 29,
  /** A name of letters, digits, `_()&`, `-` not before `>`, and inner blank runs. */
  Name: F + 30,
  /** `accDescr: …` to `%%` or the line end, or `accDescr {…}`. */
  AccDescr: F + 31,
  /** `accTitle: …` to `%%` or the line end. */
  AccTitle: F + 32,
  /** `title …` to `%%` or the line end, or `title` before a line break. */
  Title: F + 33,
  /** `0`, or `[1-9][0-9]*` not followed by `.`. */
  Int: F + 34,
  /** A `"…"` or `'…'` string; `\` escapes any character but a line end. */
  String: F + 35,
  /** `[\w]([-\w]*\w)?`, ASCII only: reached only where `Name` and `Int` are not. */
  Id: F + 36,
  /** A `---` … `---` block in the body. Hidden in v12: trivia, like comments. */
  Yaml: F + 37,
} as const;

/** The keywords after the header, in Chevrotain's order: the first that starts the text wins. */
export const KEYWORDS: readonly (readonly [word: string, kind: number])[] = [
  ['size', T.Size],
  ['evolution', T.Evolution],
  ['anchor', T.Anchor],
  ['component', T.Component],
  ['label', T.Label],
  ['inertia', T.Inertia],
  ['evolve', T.Evolve],
  ['pipeline', T.Pipeline],
  ['note', T.Note],
  ['annotations', T.Annotations],
  ['annotation', T.Annotation],
  ['accelerator', T.Accelerator],
  ['deaccelerator', T.Deaccelerator],
];

/** The STRATEGY terminal's words, in its alternation's order. */
export const STRATEGIES: readonly string[] = ['build', 'buy', 'outsource', 'market'];

/**
 * Trivia for the wardley parser: the shared trivia kinds and {@link T.Yaml}. In-text `%%`
 * comments are `Kind.Comment` and `%%{…}%%` directives `Kind.Directive`, like the spans v12
 * removed before lexing.
 */
export const WARDLEY_TRIVIA = /* @__PURE__ */ kindSet(
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
  [T.LBracket]: '[',
  [T.Comma]: ',',
  [T.RBracket]: ']',
  [T.At]: '@',
  [T.Slash]: '/',
  [T.LParen]: '(',
  [T.RParen]: ')',
  [T.Dash]: '-',
  [T.LBrace]: '{',
  [T.RBrace]: '}',
  [T.Decimal]: 'WARDLEY_NUMBER',
  [T.Arrow]: 'ARROW',
  [T.LinkPort]: 'LINK_PORT',
  [T.LinkArrow]: 'LINK_ARROW',
  [T.LinkLabel]: 'LINK_LABEL',
  [T.Strategy]: 'STRATEGY',
  [T.WardleyBeta]: 'KW_WARDLEY',
  [T.Size]: 'KW_SIZE',
  [T.Evolution]: 'KW_EVOLUTION',
  [T.Anchor]: 'KW_ANCHOR',
  [T.Component]: 'KW_COMPONENT',
  [T.Label]: 'KW_LABEL',
  [T.Inertia]: 'KW_INERTIA',
  [T.Evolve]: 'KW_EVOLVE',
  [T.Pipeline]: 'KW_PIPELINE',
  [T.Note]: 'KW_NOTE',
  [T.Annotations]: 'KW_ANNOTATIONS',
  [T.Annotation]: 'KW_ANNOTATION',
  [T.Accelerator]: 'KW_ACCELERATOR',
  [T.Deaccelerator]: 'KW_DEACCELERATOR',
  [T.Name]: 'NAME_WITH_SPACES',
  [T.AccDescr]: 'ACC_DESCR',
  [T.AccTitle]: 'ACC_TITLE',
  [T.Title]: 'TITLE',
  [T.Int]: 'INT',
  [T.String]: 'STRING',
  [T.Id]: 'ID',
  [Kind.Newline]: 'NEWLINE',
  [T.Yaml]: 'YAML',
  [Kind.Directive]: 'DIRECTIVE',
  [Kind.Comment]: 'SINGLE_LINE_COMMENT',
  [Kind.Error]: 'LEXICAL_ERROR',
};
