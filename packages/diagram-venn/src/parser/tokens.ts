// cspell:words RGBACOLOR RGBCOLOR
/**
 * Venn token kinds. They mirror the terminals of v12's `venn.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `venn-beta` (case-insensitive, then `\b`). */
  Venn: F,
  /** `title`, one `\s` (a line break too), then `[^#\n;]+`: the whole token, keyword included. */
  Title: F + 1,
  /** `set` (case-insensitive, then `\b`). */
  Set: F + 2,
  /** `union` (case-insensitive, then `\b`). */
  Union: F + 3,
  /** `text` (case-insensitive, then `\b`) that does not follow an {@link IndentText}. */
  Text: F + 4,
  /** `style` (case-insensitive, then `\b`). */
  Style: F + 5,
  /**
   * The blanks at a line start before `text` while indent mode is on (from a `set` or `union`
   * to the next line that starts with anything else, blank and comment lines aside). jison
   * returns `INDENT_TEXT` for them.
   */
  IndentText: F + 6,
  /** The `text` right after an {@link IndentText} (jison returns no token for it). */
  IndentTextKeyword: F + 7,
  /** `["…"]` (`[^"]*` inside, line breaks included); its text is the inside. */
  QuotedLabel: F + 8,
  /** `[…]` (`[^\]"]+` inside, line breaks included); its text is the inside, trimmed. */
  Label: F + 9,
  /** `[+-]?(\d+(\.\d+)?|\.\d+)`. */
  Numeric: F + 10,
  /** `#` and three to eight hex digits. */
  HexColor: F + 11,
  /** `rgba(` four numbers `)`, case-insensitive, `\s*` (line breaks too) around each. */
  RgbaColor: F + 12,
  /** `rgb(` three numbers `)`, case-insensitive, `\s*` (line breaks too) around each. */
  RgbColor: F + 13,
  /** `[A-Za-z_][A-Za-z0-9\-_]*`. */
  Identifier: F + 14,
  /** `"[^"]*"`, quotes kept, line breaks included. */
  String: F + 15,
  Comma: F + 16,
  Colon: F + 17,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 18,
} as const;

/**
 * The v12 `venn.jison` terminal each kind stands for (dev and test use: the lexer-parity gate
 * compares token streams by these names). Never shown to users (R-ERR-5). Kinds without an
 * entry have no jison token; `LEXICAL_ERROR` marks where jison threw. A run of line breaks is
 * the shared `Kind.Newline` (jison's `NEWLINE`); a `%%` comment v12's comment removal left is
 * the shared `Kind.Comment`, which jison skips.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Venn]: 'VENN',
  [T.Title]: 'TITLE',
  [T.Set]: 'SET',
  [T.Union]: 'UNION',
  [T.Text]: 'TEXT',
  [T.Style]: 'STYLE',
  [T.IndentText]: 'INDENT_TEXT',
  [T.QuotedLabel]: 'BRACKET_LABEL',
  [T.Label]: 'BRACKET_LABEL',
  [T.Numeric]: 'NUMERIC',
  [T.HexColor]: 'HEXCOLOR',
  [T.RgbaColor]: 'RGBACOLOR',
  [T.RgbColor]: 'RGBCOLOR',
  [T.Identifier]: 'IDENTIFIER',
  [T.String]: 'STRING',
  [T.Comma]: 'COMMA',
  [T.Colon]: 'COLON',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
