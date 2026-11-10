/**
 * Every message the block parser writes (R-ERR-5: Mermaid terms, never a token or rule name):
 * the names of what was expected, the hints after them, and the messages of its own codes.
 */
import { listOf } from './text.ts';
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

// ---- what was expected --------------------------------------------------------------------

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
export const CLASS_STYLES = ["the class's styles"];
export const STYLES = ['the styles'];
export const IDS = ['block ids such as `a` or `a, b`'];
export const COMPOSITE_ID = ["the composite's id, as in `block:id`"];
/** The closer named for an opener (`]` for `[`). */
export const closerFor = (open: string): string[] => [`\`${CLOSERS[open] ?? ']'}\``];

// ---- what was found -----------------------------------------------------------------------

export const END_OF_TEXT = 'the end of the text';
export const A_LINE_BREAK = 'a line break';
export const BLANKS = 'blanks';
export const END_WORD = '`end`';
/** A token's text in a message: its first line, cut at 24 characters. */
export function quoted(text: string): string {
  const line = /^[^\n\r\u2028\u2029]*/.exec(text)?.[0] ?? '';
  const cut = line.length > 24 ? line.slice(0, 24) : line;
  return cut.length < text.length ? `\`${cut}…\`` : `\`${text}\``;
}

// ---- hints ----------------------------------------------------------------------------------

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
export const EMPTY_DIAGRAM_HINT = 'write at least one block in the diagram';
export const EMPTY_COMPOSITE_HINT =
  'a composite holds at least one statement: write at least one block in it';
export const END_NONE_OPEN_HINT = 'an `end` closes a `block`, and none is open';

/** `message` (`Expected …, got ….`) with `hint` after it: `…; hint.`. */
export const withHint = (message: string, hint: string): string =>
  `${message.slice(0, -1)}; ${hint}.`;

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

// ---- messages of their own ------------------------------------------------------------------

/** What was left open where the text ended. */
export interface Unclosed {
  code: string;
  what: string;
  open: string;
  close: string;
}

export const OPEN_STRING: Unclosed = {
  code: 'UNCLOSED_STRING',
  what: 'string',
  open: '"',
  close: '"',
};
export const OPEN_MD_STRING: Unclosed = {
  code: 'UNCLOSED_STRING',
  what: 'string',
  open: '"`',
  close: '`"',
};
export const OPEN_ARROW: Unclosed = {
  code: 'UNCLOSED_SHAPE',
  what: 'block arrow',
  open: '<[',
  close: ']>(…)',
};
/** A shape opened with `open` and not closed. */
export const openShape = (open: string): Unclosed => ({
  code: 'UNCLOSED_SHAPE',
  what: 'shape',
  open,
  close: CLOSERS[open] ?? ']',
});

export const unclosedMessage = ({ what, open, close }: Unclosed, line: number): string =>
  `Unclosed ${what}: the \`${open}\` at line ${line} has no closing \`${close}\`. Add \`${close}\` after its text.`;

export const unfinishedEdgeMessage = (link: string, line: number): string =>
  `Unfinished edge: the \`${link}\` at line ${line} takes a quoted label and a closing link, as in \`a -- "text" --> b\`.`;

export const unclosedBlockMessage = (line: number): string =>
  `Unclosed composite: the \`block\` at line ${line} has no \`end\`. Add \`end\` after its last statement.`;

/** A breached limit (R-SEC-5): what there is too much of, and the limit. */
export function limitMessage(what: 'blocks' | 'edges' | 'depth', max: number): string {
  const head =
    what === 'depth'
      ? `Composites nest more than ${max} deep`
      : `The diagram has more than ${max} ${what}`;
  return `${head}, the limit. The limit is set by the page or app that renders the diagram.`;
}

/** D443: `style` naming ids no statement declares (each in backticks). */
export function styleUnknownMessage(ids: readonly string[]): string {
  const one = ids.length === 1;
  return `\`style\` names ${one ? 'a block' : 'blocks'} the diagram does not have: ${listOf(ids.map((id) => `\`${id}\``))}. Declare ${one ? 'it' : 'them'}, or check the spelling.`;
}
export const styledHere = (id: string): string => `\`${id}\` is styled here`;

export const SIZE_INVALID_MESSAGE =
  '`columns 0` reads as `columns auto` and a span `:0` as `:1`, as mermaid@12 could not draw them.';
export const truncatedMessage = (span: number, cells: number): string =>
  `A span is at most ${span} columns and a \`space\` at most ${cells} cells; larger ones are cut to that.`;
export const ALSO_HERE = 'also here';
