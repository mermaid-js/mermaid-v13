/**
 * Kanban token kinds. They mirror the terminals of v12's `kanban.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';
import { TREE_BASE_KINDS, TREE_JISON_NAMES } from '@mermaid-js/shared/parser/tree';

const F = FIRST_DIAGRAM_KIND;
const B = TREE_BASE_KINDS;

export const T = {
  /** `kanban` (case-insensitive, word-bounded), wherever a token starts in INITIAL. */
  Kanban: F,
  // The shared kinds, under the shared numbers (`TREE_BASE_KINDS`).
  SpaceLine: B.SpaceLine,
  SpaceList: B.SpaceList,
  /** `[^\(\[\n\)\{\}@]+`: an item id (blanks, `:`, `;`, `%`, `]` and quotes included). */
  NodeId: B.NodeId,
  NodeDStart: B.NodeDStart,
  NodeDescr: B.NodeDescr,
  NodeDEnd: B.NodeDEnd,
  IconStart: B.IconStart,
  Icon: B.Icon,
  IconEnd: B.IconEnd,
  ClassStart: B.ClassStart,
  Class: B.Class,
  ClassEnd: B.ClassEnd,
  StringStart: B.StringStart,
  StringEnd: B.StringEnd,
  MdStringStart: B.MdStringStart,
  MdStringEnd: B.MdStringEnd,
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
  /**
   * `accTitle: …` at a line start, to the line end (D742). v12 has no such token: it read the
   * line as a `NODE_ID`, an item.
   */
  AccTitle: F + 23,
  /** `accDescr: …` to the line end, or `accDescr { … }` to its `}` (D742; v12: items). */
  AccDescr: F + 24,
} as const;

/**
 * The v12 `kanban.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry have no jison token; `LEXICAL_ERROR` marks where jison threw. A run of line breaks
 * is the shared `Kind.Newline` (jison's `NL`).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  ...TREE_JISON_NAMES,
  [T.Kanban]: 'KANBAN',
  [T.ShapeDataStart]: 'SHAPE_DATA',
  [T.ShapeData]: 'SHAPE_DATA',
  [T.ShapeDataQuote]: 'SHAPE_DATA',
  [T.ShapeDataStr]: 'SHAPE_DATA',
  [T.Eof]: 'EOF',
  // No jison terminal: the names the grammar file gives them (D742).
  [T.AccTitle]: 'ACC_TITLE',
  [T.AccDescr]: 'ACC_DESCR',
};
