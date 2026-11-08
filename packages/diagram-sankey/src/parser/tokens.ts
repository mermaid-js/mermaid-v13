/**
 * Sankey token kinds. They mirror the terminals of v12's `sankey.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /**
   * `sankey-beta` or `sankey` (ASCII case-insensitive, word-bounded), wherever a token starts
   * before the first one: in INITIAL only.
   */
  Sankey: F,
  /** `,` outside a quoted field. */
  Comma: F + 1,
  /** The `"` opening a quoted field. */
  OpenQuote: F + 2,
  /** The `"` closing a quoted field: one not followed by another `"`. */
  CloseQuote: F + 3,
  /**
   * `[\x20-\x21\x23-\x2B\x2D-\x7E]+` (`{TEXTDATA}`): a field outside quotes, blanks included,
   * up to a `,`, `"`, line break, or a character outside printable ASCII.
   */
  Text: F + 4,
  /**
   * The inside of a quoted field: `{TEXTDATA}`, `,`, line breaks and `""` pairs (kept as
   * written; v12's grammar action undoubled them). Zero-width when the text ends inside the
   * quotes, where jison returned one empty `ESCAPED_TEXT` before `$end`.
   */
  EscapedText: F + 5,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, outside quotes. */
  Eof: F + 6,
} as const;

/**
 * The v12 `sankey.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Both quotes
 * are `DQUOTE`; a line break (a run of them, which v12 collapsed into one) is the shared
 * `Kind.Newline`. `Kind.Error` marks a run of characters outside printable ASCII (a tab,
 * a control character, a non-ASCII character, an entity), where jison's `{TEXTDATA}*` and
 * `ESCAPED_TEXT` rules matched the empty string forever.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Sankey]: 'SANKEY',
  [T.Comma]: 'COMMA',
  [T.OpenQuote]: 'DQUOTE',
  [T.CloseQuote]: 'DQUOTE',
  [T.Text]: 'NON_ESCAPED_TEXT',
  [T.EscapedText]: 'ESCAPED_TEXT',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
