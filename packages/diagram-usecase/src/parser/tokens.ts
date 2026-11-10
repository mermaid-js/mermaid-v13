/**
 * Usecase token kinds. They mirror the tokens of v12's Chevrotain lexer
 * (`mermaid@12.2.0:…/diagrams/usecase/parser/usecase.tokens.ts`), one kind per token type, so
 * the lexer can be gated token by token against it (parser-method §1, D324). v12's `NEWLINE`
 * is {@link Kind.Newline} and its `COMMENT` (a `%%` line v12's comment removal left, as `%%`
 * alone) is {@link Kind.Comment}; `HWS` is skipped and has no kind. Kinds are plain numbers
 * (TS enums are banned).
 */
// cspell:words markerless
import { FIRST_DIAGRAM_KIND, Kind, kindSet } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** A markdown string: a quote and a backtick, to a backtick and a quote, across lines. */
  MarkdownString: F,
  /** A markdown string never closed: the rest of the text. */
  UnclosedMarkdownString: F + 1,
  /** `accDescr {…}` at a line start (only blanks before it), to the first `}`. */
  AccDescrBlock: F + 2,
  /** `accTitle:` and the rest of the line, at a line start. */
  AccTitleLine: F + 3,
  /** `accDescr:` and the rest of the line, at a line start. */
  AccDescrLine: F + 4,
  /** `json <id> @` before a `{`; the object is the next token. */
  JsonDeclarationStart: F + 5,
  /** The brace- and string-aware JSON object after a declaration. */
  JsonObjectLiteral: F + 6,
  /** An object never closed: the rest of the text. */
  UnclosedJsonObjectLiteral: F + 7,
  // Keywords (`WORD`): a longer `\w` run makes them an `Identifier`.
  Usecase: F + 8,
  Actor: F + 9,
  SystemBoundary: F + 10,
  End: F + 11,
  Direction: F + 12,
  Td: F + 13,
  Tb: F + 14,
  Bt: F + 15,
  Lr: F + 16,
  Rl: F + 17,
  Note: F + 18,
  For: F + 19,
  Json: F + 20,
  ClassDef: F + 21,
  Class: F + 22,
  Style: F + 23,
  /** `include` in any case. */
  Include: F + 24,
  /** `extend` in any case. */
  Extend: F + 25,
  True: F + 26,
  False: F + 27,
  // Operators.
  /** `--|>`. */
  Generalization: F + 28,
  /** `..>`. */
  DependencyArrow: F + 29,
  /** `<<`: the stereotype text and `>>` follow. */
  StereotypeStart: F + 30,
  StereotypeEnd: F + 31,
  /** Up to the first `>>` on the line, when not blank. */
  StereotypeText: F + 32,
  /** The rest of the line after `<<` when no `>>` closes it there (or the text is blank). */
  UnclosedStereotypeText: F + 33,
  /** `:::`. */
  ClassSeparator: F + 34,
  /** `--+>`. */
  ForwardSolid: F + 35,
  /** `<--+`. */
  BackwardSolid: F + 36,
  /** `--o`. */
  ForwardCircle: F + 37,
  /** `o--`. */
  BackwardCircle: F + 38,
  /** `--x`. */
  ForwardCross: F + 39,
  /** `x--`. */
  BackwardCross: F + 40,
  /** `--+` not followed by `>`, `o` or `x` (`---o` is this, then `o`). */
  MarkerlessSolid: F + 41,
  /** `@{`. */
  MetadataStart: F + 42,
  At: F + 43,
  LBrace: F + 44,
  RBrace: F + 45,
  LBracket: F + 46,
  RBracket: F + 47,
  LParen: F + 48,
  RParen: F + 49,
  Comma: F + 50,
  Colon: F + 51,
  /** `#` and hex digits. */
  HashColor: F + 52,
  /** `"…"` or `'…'` on one line, no escapes. */
  PlainString: F + 53,
  /** `a-b`: a word and one or more `-` words (`my-node`). */
  CssIdentifier: F + 54,
  /** `\w+` (ASCII), digits first allowed (`1mg`). */
  Identifier: F + 55,
  /** `1.5`, `1.5px`, `.5`: a decimal with an optional unit. */
  Number: F + 56,
  /** `\,`. */
  CssEscapedComma: F + 57,
  Dash: F + 58,
  Dot: F + 59,
  Percent: F + 60,
  /** One of `!#$&*+/=?^|~`. */
  CssPunctuation: F + 61,
  /** `;`, `<`, `>`, a backslash or a backtick. */
  LabelPunctuation: F + 62,
  /** A run of characters outside printable ASCII, tab, CR and LF (`日本語`, NBSP, `\f`). */
  LabelSymbol: F + 63,
} as const;

/** The keywords, in v12's order: the first that starts the text wins, then a longer `\w` run. */
export const KEYWORDS: readonly (readonly [word: string, kind: number])[] = [
  ['usecase-beta', T.Usecase],
  ['actor', T.Actor],
  ['systemBoundary', T.SystemBoundary],
  ['end', T.End],
  ['direction', T.Direction],
  ['TD', T.Td],
  ['TB', T.Tb],
  ['BT', T.Bt],
  ['LR', T.Lr],
  ['RL', T.Rl],
  ['note', T.Note],
  ['for', T.For],
  ['json', T.Json],
  ['classDef', T.ClassDef],
  ['class', T.Class],
  ['style', T.Style],
  ['include', T.Include],
  ['extend', T.Extend],
  ['true', T.True],
  ['false', T.False],
];

/** The keywords matched in any case (`/include/i`, `/extend/i`). */
export const ANY_CASE: ReadonlySet<number> = new Set([T.Include, T.Extend]);

/** v12's `WORD` category: the keywords and `IDENTIFIER`. */
export const WORD = /* @__PURE__ */ kindSet(...KEYWORDS.map(([, kind]) => kind), T.Identifier);

/** v12's `LABEL_TEXT` category: what an unquoted label may hold. */
export const LABEL_TEXT = /* @__PURE__ */ kindSet(
  ...KEYWORDS.map(([, kind]) => kind),
  T.Identifier,
  T.Number,
  T.At,
  T.Comma,
  T.Colon,
  T.HashColor,
  T.CssIdentifier,
  T.CssEscapedComma,
  T.Dash,
  T.Dot,
  T.Percent,
  T.CssPunctuation,
  T.LabelPunctuation,
  T.LabelSymbol
);

/** Kind → v12's Chevrotain token type name (the lexer-parity gate's mapping). */
export const CHEVROTAIN_NAMES: Readonly<Record<number, string>> = {
  [Kind.Newline]: 'NEWLINE',
  [Kind.Comment]: 'COMMENT',
  [T.MarkdownString]: 'MARKDOWN_STRING',
  [T.UnclosedMarkdownString]: 'UNCLOSED_MARKDOWN_STRING',
  [T.AccDescrBlock]: 'ACC_DESCR_BLOCK',
  [T.AccTitleLine]: 'ACC_TITLE_LINE',
  [T.AccDescrLine]: 'ACC_DESCR_LINE',
  [T.JsonDeclarationStart]: 'JSON_DECLARATION_START',
  [T.JsonObjectLiteral]: 'JSON_OBJECT_LITERAL',
  [T.UnclosedJsonObjectLiteral]: 'UNCLOSED_JSON_OBJECT_LITERAL',
  [T.Usecase]: 'USECASE',
  [T.Actor]: 'ACTOR',
  [T.SystemBoundary]: 'SYSTEM_BOUNDARY',
  [T.End]: 'END',
  [T.Direction]: 'DIRECTION',
  [T.Td]: 'TD',
  [T.Tb]: 'TB',
  [T.Bt]: 'BT',
  [T.Lr]: 'LR',
  [T.Rl]: 'RL',
  [T.Note]: 'NOTE',
  [T.For]: 'FOR',
  [T.Json]: 'JSON',
  [T.ClassDef]: 'CLASS_DEF',
  [T.Class]: 'CLASS',
  [T.Style]: 'STYLE',
  [T.Include]: 'INCLUDE',
  [T.Extend]: 'EXTEND',
  [T.True]: 'TRUE',
  [T.False]: 'FALSE',
  [T.Generalization]: 'GENERALIZATION',
  [T.DependencyArrow]: 'DEPENDENCY_ARROW',
  [T.StereotypeStart]: 'STEREOTYPE_START',
  [T.StereotypeEnd]: 'STEREOTYPE_END',
  [T.StereotypeText]: 'STEREOTYPE_TEXT',
  [T.UnclosedStereotypeText]: 'UNCLOSED_STEREOTYPE_TEXT',
  [T.ClassSeparator]: 'CLASS_SEPARATOR',
  [T.ForwardSolid]: 'FORWARD_SOLID',
  [T.BackwardSolid]: 'BACKWARD_SOLID',
  [T.ForwardCircle]: 'FORWARD_CIRCLE',
  [T.BackwardCircle]: 'BACKWARD_CIRCLE',
  [T.ForwardCross]: 'FORWARD_CROSS',
  [T.BackwardCross]: 'BACKWARD_CROSS',
  [T.MarkerlessSolid]: 'MARKERLESS_SOLID',
  [T.MetadataStart]: 'METADATA_START',
  [T.At]: 'AT',
  [T.LBrace]: 'LBRACE',
  [T.RBrace]: 'RBRACE',
  [T.LBracket]: 'LBRACKET',
  [T.RBracket]: 'RBRACKET',
  [T.LParen]: 'LPAREN',
  [T.RParen]: 'RPAREN',
  [T.Comma]: 'COMMA',
  [T.Colon]: 'COLON',
  [T.HashColor]: 'HASH_COLOR',
  [T.PlainString]: 'PLAIN_STRING',
  [T.CssIdentifier]: 'CSS_IDENTIFIER',
  [T.Identifier]: 'IDENTIFIER',
  [T.Number]: 'NUMBER',
  [T.CssEscapedComma]: 'CSS_ESCAPED_COMMA',
  [T.Dash]: 'DASH',
  [T.Dot]: 'DOT',
  [T.Percent]: 'PERCENT',
  [T.CssPunctuation]: 'CSS_PUNCTUATION',
  [T.LabelPunctuation]: 'LABEL_PUNCTUATION',
  [T.LabelSymbol]: 'LABEL_SYMBOL',
};
