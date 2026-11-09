// cspell:words preorder
// Draws a treeView on the text grid (D488): `tree(1)` style from the first real row, with no
// `/` row. A node at the top is a line of its own at column 0; a node under it hangs from its
// parent's column by `├── ` (`└── ` for the last child), each ancestor below the top adding
// `│   ` while it has siblings still to come, else four blanks. Directories keep their `/`. The
// descriptions sit in one column, two cells past the longest line; a highlighted row is marked
// in a one-cell gutter, there only when a row is highlighted.
import { cellWidth } from '@mermaid-js/core/ascii';
import { highlighted } from '../layout/layout.ts';
import type { TreeViewModel, TreeViewNode } from '../model.ts';
import { plain, written } from './names.ts';

/** The prefixes of one charset (D488). */
interface TreeGlyphs {
  /** A child with siblings after it. */
  readonly tee: string;
  /** The last child. */
  readonly last: string;
  /** Under an ancestor with siblings after it. */
  readonly bar: string;
  /** Under an ancestor that was the last child. */
  readonly blank: string;
  /** The highlight mark, in the gutter. */
  readonly mark: string;
}

const GLYPHS: Readonly<Record<'unicode' | 'ascii', TreeGlyphs>> = {
  unicode: { tee: '├── ', last: '└── ', bar: '│   ', blank: '    ', mark: '▶' },
  ascii: { tee: '|-- ', last: '`-- ', bar: '|   ', blank: '    ', mark: '>' },
};

/** Cells between the longest line and the description column. */
const DESCRIPTION_GAP = 2;

/** One line of the drawing. */
interface Line {
  readonly node: TreeViewNode;
  /** The prefix and the name as written. */
  readonly text: string;
}

/** The lines in preorder, each with its prefix. Iterative: a deep tree cannot overflow the stack. */
function treeLines(model: TreeViewModel, glyphs: TreeGlyphs): Line[] {
  const out: Line[] = [];
  const seen = new Map<string, string>();
  // A node still to draw, the prefix its line starts with, and the one its children's do.
  const todo: [TreeViewNode, string, string][] = [];
  for (let i = model.roots.length - 1; i >= 0; i--) todo.push([model.roots[i]!, '', '']);
  while (todo.length > 0) {
    const [node, own, under] = todo.pop()!;
    out.push({ node, text: own + written(node, seen) });
    const { children } = node;
    for (let i = children.length - 1; i >= 0; i--) {
      const lastChild = i === children.length - 1;
      todo.push([
        children[i]!,
        under + (lastChild ? glyphs.last : glyphs.tee),
        under + (lastChild ? glyphs.blank : glyphs.bar),
      ]);
    }
  }
  return out;
}

/** `line` without the spaces at its end. */
function trimSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line.charAt(end - 1) === ' ') end--;
  return line.slice(0, end);
}

/**
 * `model` as text in `charset`: `\n` line ends, no trailing blanks. Each line is built as a
 * string, not on a `Canvas`: a deep branch makes a few lines long, and a grid as wide as the
 * longest for every row would grow with depth times rows.
 */
export function drawTreeView(model: TreeViewModel, charset: 'unicode' | 'ascii'): string {
  const glyphs = GLYPHS[charset];
  const rows = treeLines(model, glyphs);
  // The gutter cell of each row, when a row is highlighted.
  const gutter = rows.some((r) => highlighted(r.node))
    ? (r: Line): string => (highlighted(r.node) ? glyphs.mark : ' ')
    : (): string => '';
  const widths = rows.map((r) => cellWidth(r.text));
  let column = 0;
  for (const w of widths) column = Math.max(column, w);
  column += DESCRIPTION_GAP;
  return rows
    .map((r, i) => {
      const { description } = r.node;
      const tail =
        description === undefined ? '' : ' '.repeat(column - widths[i]!) + plain(description);
      return trimSpaces(gutter(r) + r.text + tail);
    })
    .join('\n');
}
