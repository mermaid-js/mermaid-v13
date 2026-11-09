// How a node's name is written in text (D488): as the SVG shows it, a directory's with its `/`,
// so that the drawing (without its descriptions) is treeView box input that reads back to the
// same tree. A name that would not read back bare (a blank at either end, an annotation mark, a
// `%%`, a quote at its start, a leading keyword) is put in quotes, as its author had to write
// it. The parser decides: a written form is taken only when it reads, where the drawing puts it,
// back to the name. A name holding a line break or another control is written bare with a blank
// for each (no form reads back).
import { writtenName } from '../parser/convert.ts';
import { parseTreeView } from '../parser/index.ts';
import type { TreeViewNode } from '../model.ts';

/**
 * Line breaks, tabs and other controls are one blank each: one row a node, and every glyph a
 * cell (an SVG text shows them as blanks too).
 */
export const plain = (text: string): string => text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');

/**
 * Whether `w` reads back bare without asking the parser: not empty, no blank at either end and
 * no blank but spaces, no quote at its start, no leading keyword, no annotation mark, comment,
 * entity or box glyph.
 */
function safe(w: string): boolean {
  return (
    w !== '' &&
    !/^["']|^\s|\s$|[^\S ]/u.test(w) &&
    !/^(?:title|acc|treeView)/i.test(w) &&
    !/:::|icon\(|[#%─━│┃└┗├┣]/u.test(w)
  );
}

/**
 * Whether `w` reads back as `node`'s name and kind where the drawing puts it: a line of its own
 * at column 0 for a node at the top (a box line after it, so that the box pass runs), else
 * after a branch.
 */
function readsBack(w: string, node: TreeViewNode): boolean {
  const top = node.depth === 0;
  const r = parseTreeView(top ? `treeView-beta\n${w}\n└── x\n` : `treeView-beta\n├── ${w}\n`);
  if (r.diagnostics.length > 0 || r.model.nodes.length !== (top ? 2 : 1)) return false;
  const n = r.model.nodes[0]!;
  return (
    n.name === node.name &&
    n.directory === node.directory &&
    n.children.length === (top ? 1 : 0) &&
    n.icon === undefined &&
    n.cssClass === undefined &&
    n.description === undefined
  );
}

/**
 * `node`'s name as the drawing writes it. `seen` keeps what the parser decided for one drawing,
 * by position and bare form, so a repeated name is read back once.
 */
export function written(node: TreeViewNode, seen: Map<string, string>): string {
  const bare = writtenName(node.name, node.directory);
  const shown = plain(bare);
  if (shown !== bare) return shown;
  if (safe(bare)) return bare;
  const key = `${node.depth === 0 ? 't' : 'b'}${bare}`;
  let w = seen.get(key);
  if (w === undefined) {
    w = [bare, `"${bare}"`, `'${bare}'`].find((x) => readsBack(x, node)) ?? bare;
    seen.set(key, w);
  }
  return w;
}
