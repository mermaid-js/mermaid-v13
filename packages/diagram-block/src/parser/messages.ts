/**
 * What the block parser's messages say (R-ERR-5: Mermaid terms, never a token or rule name):
 * the names of what was expected, and the hints after them.
 */
import { T } from './tokens.ts';

/** What a closer the opener reads best with is, for messages (any closer parses, as in v12). */
export const CLOSERS: Readonly<Record<string, string>> = {
  '[': ']',
  '(': ')',
  '((': '))',
  '(((': ')))',
  '([': '])',
  '[[': ']]',
  '[(': ')]',
  '[/': '/]',
  '[\\': '\\]',
  '{': '}',
  '{{': '}}',
  '>': ']',
  ')': '(',
  '))': '((',
  '-)': '(-',
  '(-': '-)',
  '[|': ']',
};

export const HEADER = ['`block-beta` or `block`'];
export const STATEMENT = [
  'a block such as `a` or `a["text"]`',
  'a composite `block:id … end`',
  '`columns` or `space`',
  '`classDef`, `class` or `style`',
];
export const STATEMENT_OR_END = [...STATEMENT.slice(0, 3), '`end`'];
export const BLOCK = ['a block such as `b` or `b["text"]`'];
export const LABEL = ['a quoted text such as `"text"`'];
export const DIRECTION = ['a direction: `right`, `left`, `up`, `down`, `x` or `y`'];
export const DIRECTION_OR_CLOSE = [...DIRECTION, '`)`'];
export const EDGE_LABEL = ['a quoted edge label, as in `a -- "text" --> b`'];
export const EDGE_END = ['the rest of the edge, such as `-->`'];
export const CLASS_NAME = ['a class name'];
export const IDS = ['block ids such as `a` or `a, b`'];

export const HEADER_HINT = 'a block diagram starts with `block-beta` or `block`';
const SHAPE_HINT = 'a shape goes right after a block id, as in `a["text"]`';
const SIZE_HINT =
  'a span such as `:2` goes right after the first block of a statement or of a composite header';
const LINK_HINT = 'an edge goes between two blocks, as in `a --> b`';
const STRING_HINT = 'a quoted text goes inside a shape, as in `a["text"]`';
export const MARKDOWN_HINT = 'block diagrams take no markdown strings: write `"text"`';
const ACC_HINT = 'block diagrams have no `accTitle` or `accDescr`';
const RESERVED_HINT = 'this word is reserved and starts no statement';
export const DEFAULT_HINT = 'block diagrams have no `DEFAULT` class: use another name';
export const UNQUOTED_HINT = 'a label is written in quotes, as in `a["text"]`';
export const EMPTY_HINT = 'write at least one block in it';

/** The hint for an unexpected token of kind `k` where a statement was due. */
export function hintFor(k: number): string | undefined {
  switch (k) {
    case T.NodeDStart:
    case T.BlockArrowStart:
      return SHAPE_HINT;
    case T.Size:
      return SIZE_HINT;
    case T.Link:
    case T.StartLink:
    case T.LinkLabel:
      return LINK_HINT;
    case T.Str:
      return STRING_HINT;
    case T.MdStr:
      return MARKDOWN_HINT;
    case T.AccTitle:
    case T.AccTitleValue:
    case T.AccDescr:
    case T.AccDescrValue:
    case T.AccDescrMultilineValue:
      return ACC_HINT;
    case T.Default:
    case T.LinkStyle:
    case T.Interpolate:
      return RESERVED_HINT;
    default:
      return undefined;
  }
}
