/**
 * Kanban token kinds. They mirror the terminals of v12's `kanban.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `kanban` (case-insensitive, word-bounded), wherever a token starts in INITIAL. */
  Kanban: F,
  /**
   * `\s*%%.*` (a `%%` that v12's comment removal left: mid-line, or a bare `%%` line, with the
   * blanks and line breaks before it), or `[\s]+[\n]`: blanks up to the last line break of
   * their run. One token either way.
   */
  SpaceLine: F + 1,
  /** `[\s]+` holding no line break: the indent before an item. */
  SpaceList: F + 2,
  /** `[^\(\[\n\)\{\}@]+`: an item id (blanks, `:`, `;`, `%`, `]` and quotes included). */
  NodeId: F + 3,
  /** A shape opener: `-)`, `(-`, `))`, `)`, `((`, `{{`, `(` or `[`. */
  NodeDStart: F + 4,
  /**
   * An item's text: inside the shape (`[^\)\]\(\}]+`, line breaks included, or a `}` and the
   * rest of its line), or the inside of a quoted or markdown (quote and backtick) string.
   */
  NodeDescr: F + 5,
  /** A shape closer: `))`, `)`, `]`, `}}`, `(-`, `-)`, `((` or `(`. */
  NodeDEnd: F + 6,
  /** `::icon(` (jison returns no token for it). */
  IconStart: F + 7,
  /** `[^\)]+` after `::icon(`, line breaks included. */
  Icon: F + 8,
  /** The `)` closing `::icon(` (jison returns no token for it). */
  IconEnd: F + 9,
  /** `:::` (jison returns no token for it). */
  ClassStart: F + 10,
  /** `.+` after `:::`: the rest of the line. */
  Class: F + 11,
  /** The line break right after a bare `:::` (jison returns no token for it). */
  ClassEnd: F + 12,
  /** `"` opening a string in a shape (jison returns no token for it). */
  StringStart: F + 13,
  /** `"` closing it (jison returns no token for it). */
  StringEnd: F + 14,
  /** A quote then a backtick, opening a markdown string in a shape (jison returns no token for it). */
  MdStringStart: F + 15,
  /** A backtick then a quote, closing it (jison returns no token for it). */
  MdStringEnd: F + 16,
  /**
   * `@{`, opening shape data. jison returns a `SHAPE_DATA` whose image its action cleared, so
   * the token's text is empty (its range still covers `@{`).
   */
  ShapeDataStart: F + 17,
  /** `[^}^"]+` in shape data: YAML text outside quotes, line breaks included. */
  ShapeData: F + 18,
  /** A `"` in shape data, opening or closing a quoted run: a `SHAPE_DATA` of its own. */
  ShapeDataQuote: F + 19,
  /**
   * `[^"]+` inside a quoted run of shape data. jison's action replaced each `\n\s*` in it with
   * `<br/>`, and so does the token's text.
   */
  ShapeDataStr: F + 20,
  /** The `}` closing shape data (jison returns no token for it). */
  ShapeDataEnd: F + 21,
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, in INITIAL only. */
  Eof: F + 22,
} as const;

/**
 * The v12 `kanban.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry have no jison token; `LEXICAL_ERROR` marks where jison threw. A run of line breaks
 * is the shared `Kind.Newline` (jison's `NL`).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  [T.Kanban]: 'KANBAN',
  [T.SpaceLine]: 'SPACELINE',
  [T.SpaceList]: 'SPACELIST',
  [T.NodeId]: 'NODE_ID',
  [T.NodeDStart]: 'NODE_DSTART',
  [T.NodeDescr]: 'NODE_DESCR',
  [T.NodeDEnd]: 'NODE_DEND',
  [T.Icon]: 'ICON',
  [T.Class]: 'CLASS',
  [T.ShapeDataStart]: 'SHAPE_DATA',
  [T.ShapeData]: 'SHAPE_DATA',
  [T.ShapeDataQuote]: 'SHAPE_DATA',
  [T.ShapeDataStr]: 'SHAPE_DATA',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NL',
  [Kind.Error]: 'LEXICAL_ERROR',
};
