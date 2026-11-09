/**
 * Sankey token kinds. They mirror the terminals of v12's `sankey.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

export const SankeyKind = {
  /**
   * `sankey-beta` or `sankey` (ASCII case-insensitive, word-bounded), wherever a token starts
   * before the first one: in INITIAL only.
   */
  Sankey: FIRST_DIAGRAM_KIND,
  /** `,` outside a quoted field. */
  Comma: FIRST_DIAGRAM_KIND + 1,
  /** The `"` opening a quoted field. */
  OpenQuote: FIRST_DIAGRAM_KIND + 2,
  /** The `"` closing a quoted field: one not followed by another `"`. */
  CloseQuote: FIRST_DIAGRAM_KIND + 3,
  /**
   * `[\x20-\x21\x23-\x2B\x2D-\x7E]+` (`{TEXTDATA}`): a field outside quotes, blanks included,
   * up to a `,`, `"`, line break, or a character outside printable ASCII.
   */
  Text: FIRST_DIAGRAM_KIND + 4,
  /**
   * The inside of a quoted field: `{TEXTDATA}`, `,`, line breaks and `""` pairs (kept as
   * written; v12's grammar action undoubled them). Zero-width when the text ends inside the
   * quotes, where jison returned one empty `ESCAPED_TEXT` before `$end`.
   */
  EscapedText: FIRST_DIAGRAM_KIND + 5,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, outside quotes. */
  Eof: FIRST_DIAGRAM_KIND + 6,
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
  [SankeyKind.Sankey]: 'SANKEY',
  [SankeyKind.Comma]: 'COMMA',
  [SankeyKind.OpenQuote]: 'DQUOTE',
  [SankeyKind.CloseQuote]: 'DQUOTE',
  [SankeyKind.Text]: 'NON_ESCAPED_TEXT',
  [SankeyKind.EscapedText]: 'ESCAPED_TEXT',
  [SankeyKind.Eof]: 'EOF',
  [Kind.Newline]: 'NEWLINE',
  [Kind.Error]: 'LEXICAL_ERROR',
};
