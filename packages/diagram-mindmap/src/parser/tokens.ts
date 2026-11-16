/**
 * Mindmap token kinds. They mirror the terminals of v12's `mindmap.jison`, so the lexer can be
 * checked token by token against it (parser-method §1). Kinds are plain numbers (TS enums are
 * banned).
 */
import { FIRST_DIAGRAM_KIND, Kind } from '@mermaid-js/core/parser-kit';
import { TREE_TOKENS } from '@mermaid-js/shared/parser/tree';

const F = FIRST_DIAGRAM_KIND;

export const T = {
  /** `mindmap` (case-insensitive, word-bounded), wherever a token starts in INITIAL. */
  Mindmap: F,
  /** The kinds every indentation-tree diagram has (`F + 1` to `F + 16`). */
  ...TREE_TOKENS,
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
  [T.Mindmap]: 'MINDMAP',
  [T.SpaceLine]: 'SPACELINE',
  [T.SpaceList]: 'SPACELIST',
  [T.NodeId]: 'NODE_ID',
  [T.NodeDStart]: 'NODE_DSTART',
  [T.NodeDescr]: 'NODE_DESCR',
  [T.NodeDEnd]: 'NODE_DEND',
  [T.Icon]: 'ICON',
  [T.Class]: 'CLASS',
  [T.Eof]: 'EOF',
  [Kind.Newline]: 'NL',
  [Kind.Error]: 'LEXICAL_ERROR',
};
