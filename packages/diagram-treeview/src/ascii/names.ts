// How a node's name is written in text (D488): as the SVG shows it, a directory's with its `/`,
// so that the drawing (without its descriptions and gutter) is treeView box input that reads
// back to the same tree. A name that would not read back bare where it is drawn (a blank at
// either end, an annotation mark, a `%%`, a quote at its start, a leading keyword) is put in
// `"…"`, else `'…'`, as its author had to write it; the parser decides (`parser/written.ts`, as
// the facet's rename). A name holding a line break or another control is written bare with a
// blank for each: no form reads back. Entity codes are decoded first (D561), as the SVG draws
// them: `#35;` is written `#`, and the form is chosen for the decoded name.
import { decodeEntities } from '@mermaid-js/core/text';
import type { TreeViewNode } from '../model.ts';
import { writtenName } from '../parser/convert.ts';
import { nameForm, type NameLine, type NameQuote } from '../parser/written.ts';

/**
 * Line breaks, tabs and other controls are one blank each: one row a node, and every glyph a
 * cell (an SVG text shows them as blanks too).
 */
export const plain = (text: string): string => text.replace(/[\p{Cc}\u2028\u2029]/gu, ' ');

const FORMS: readonly NameQuote[] = ['', '"', "'"];

/**
 * `node`'s name as the drawing writes it. `seen` keeps what the parser decided for one drawing,
 * by line and name, so a repeated name is read back once.
 */
export function written(node: TreeViewNode, seen: Map<string, string>): string {
  const name = decodeEntities(node.name);
  const bare = writtenName(name, node.directory);
  const shown = plain(bare);
  if (shown !== bare) return shown;
  const line: NameLine = node.depth === 0 ? 'box-top' : 'box-branch';
  const key = `${line}:${bare}`;
  let w = seen.get(key);
  if (w === undefined) {
    w = bare;
    for (const q of FORMS) {
      const form = nameForm(name, node.directory, q, line);
      if (form !== undefined) {
        w = form;
        break;
      }
    }
    seen.set(key, w);
  }
  return w;
}
