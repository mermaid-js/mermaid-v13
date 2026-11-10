// cspell:words treeview
/**
 * How a node's name is written so that it reads back (D487, D488): the one place both the
 * language facet's rename (`facet/names.ts`) and the text output (`ascii/names.ts`) ask. A
 * written form is taken only when the parser reads it, where it will stand, back to the name, as
 * a node of its own with no annotation. Where it stands is the line it is on:
 *
 * - `indented`: an indented line of its own between two nodes (the facet's rename);
 * - `box-top`: a box-drawn tree's line at column 0, a node at the top (the text output);
 * - `box-branch`: after a box branch, `├── ` (the text output).
 */
import type { TreeViewNode } from '../model.ts';
import { writtenName } from './convert.ts';
import { parseTreeView } from './parser.ts';

export type NameLine = 'indented' | 'box-top' | 'box-branch';

/** A quote a name can be written in, or `''` for bare. */
export type NameQuote = '' | '"' | "'";

/** The text around a written form `w` on `line`, and the node it is, by index. */
function around(w: string, line: NameLine): { text: string; nodes: number; at: number } {
  if (line === 'indented') return { text: `treeView-beta\n  x\n  ${w}\n  y\n`, nodes: 3, at: 1 };
  // A box line under it, so that the box pass runs with no glyph in `w`.
  if (line === 'box-top') return { text: `treeView-beta\n${w}\n└── x\n`, nodes: 2, at: 0 };
  return { text: `treeView-beta\n├── ${w}\n`, nodes: 1, at: 0 };
}

/** Whether `w`, on `line`, reads back as a node named `name` (a directory when `directory`). */
export function readsBack(w: string, name: string, directory: boolean, line: NameLine): boolean {
  const { text, nodes, at } = around(w, line);
  const r = parseTreeView(text);
  if (r.diagnostics.length > 0 || r.model.nodes.length !== nodes) return false;
  const n: TreeViewNode | undefined = r.model.nodes[at];
  return (
    n !== undefined &&
    n.name === name &&
    n.directory === directory &&
    n.depth === 0 &&
    n.children.length === (line === 'box-top' ? 1 : 0) &&
    n.icon === undefined &&
    n.cssClass === undefined &&
    n.description === undefined
  );
}

/**
 * Whether the bare form `w` surely reads back on any line without asking the parser, so a tree
 * of plain names is not parsed name by name. It mirrors the lexer: BARE_NAME starts with none
 * of `[ \t"']` and stops at a blank run before `:::`, `icon(` or `##` (`parser/lexer.ts`
 * `bareName`), and its trailing blanks are cut; the keyword terminals start `title`, `acc` or
 * `treeView-beta`; `%%` is a comment and `#name;` an entity (`ampEntities`); the view reads the
 * quotes in a tag (`<…>`); the box pass reads the box glyphs and skips the blanks after a
 * branch. A name with none of these is plainly bare; any other goes to the parser.
 */
export function plainlyBare(w: string): boolean {
  return (
    w !== '' &&
    !/^\s|\s$|[^\S ]/u.test(w) &&
    !/^(?:title|acc|treeView)/i.test(w) &&
    !/:::|icon\(|["'#%&<─━│┃└┗├┣]/u.test(w)
  );
}

/**
 * `name` (a directory's with its `/`) written bare (`quote` `''`) or in `quote`, if that form
 * reads back on `line`; undefined when it does not, or when the name holds that quote.
 */
export function nameForm(
  name: string,
  directory: boolean,
  quote: NameQuote,
  line: NameLine
): string | undefined {
  if (quote !== '' && name.includes(quote)) return undefined;
  const bare = writtenName(name, directory);
  if (quote === '' && plainlyBare(bare)) return bare;
  const w = `${quote}${bare}${quote}`;
  return readsBack(w, name, directory, line) ? w : undefined;
}
