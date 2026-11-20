/**
 * Mindmap token kinds. They mirror the terminals of v12's `mindmap.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND } from '@mermaid-js/core/parser-kit';
import { TREE_BASE_KINDS, TREE_JISON_NAMES } from '@mermaid-js/shared/parser/tree';

const F = FIRST_DIAGRAM_KIND;
const B = TREE_BASE_KINDS;

export const T = {
  /** `mindmap` (case-insensitive, word-bounded), wherever a token starts in INITIAL. */
  Mindmap: F,
  // The shared kinds, under the shared numbers (`TREE_BASE_KINDS`).
  SpaceLine: B.SpaceLine,
  SpaceList: B.SpaceList,
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
  /** jison's `<<EOF>>` `EOF`: zero-width, at the end of the text, outside a shape. */
  Eof: F + 17,
} as const;

/**
 * The v12 `mindmap.jison` terminal each kind stands for (dev and test use: the lexer-parity
 * gate compares token streams by these names). Never shown to users (R-ERR-5). Kinds without
 * an entry have no jison token; `LEXICAL_ERROR` marks where jison threw. A run of line breaks
 * is the shared `Kind.Newline` (jison's `NL`).
 */
export const JISON_NAMES: Readonly<Record<number, string>> = {
  ...TREE_JISON_NAMES,
  [T.Mindmap]: 'MINDMAP',
  [T.Eof]: 'EOF',
};
