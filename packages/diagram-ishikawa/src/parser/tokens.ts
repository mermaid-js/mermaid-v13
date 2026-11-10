// cspell:words SPACELINE SPACELIST
/**
 * Ishikawa token kinds. They mirror the terminals of v12's `ishikawa.jison`, so the lexer can
 * be checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums
 * are banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /**
   * `ishikawa-beta` or `ishikawa` (case-insensitive, ASCII letters only, then `\b`), wherever a
   * token starts: on the header line and at a line start inside the document alike.
   */
  Ishikawa: F,
  /**
   * `\s*%%.*`: a `%%` comment v12's comment removal left (one after other text on the header
   * line, a bare `%%` line), with the blanks and line breaks before it; `.` stops at a line end.
   */
  CommentLine: F + 1,
  /** `[\s]+[\n]`: a blank run through its last line break (a line break not first in it). */
  SpaceLine: F + 2,
  /** `[\s]+` with no line break: a line's indent, or the blanks after the keyword. */
  SpaceList: F + 3,
  /** `[^\n]+`: the rest of the line, inline `%%` and U+2028/U+2029 included. */
  Text: F + 4,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text. */
  Eof: F + 5,
} as const;

/**
 * The v12 `ishikawa.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). A lone line
 * break (`[\n]+` takes one, since `[\s]+[\n]` takes any longer run) is the shared
 * `Kind.Newline` (jison's `NL`). No input makes jison throw, so no kind maps to
 * `LEXICAL_ERROR`.
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Ishikawa]: 'ISHIKAWA',
  [T.CommentLine]: 'SPACELINE',
  [T.SpaceLine]: 'SPACELINE',
  [T.SpaceList]: 'SPACELIST',
  [T.Text]: 'TEXT',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NL',
};
