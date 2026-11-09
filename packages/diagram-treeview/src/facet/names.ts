/**
 * TreeView names (D487, D191): what `isValidId` accepts and how a rename writes a name. Each
 * node's symbol range is its name as written, its quotes and a directory's trailing `/`
 * included, so the facet reads the name inside them and writes names itself
 * ({@link treeViewNameSyntax}): a rename changes that name only, keeps its quotes (switching to
 * the other quote when the new name holds this one), keeps a directory's `/`, and puts a bare
 * name in quotes when it would not read back bare (a blank at either end, an annotation mark,
 * a `%%`, a quote at its start). The parser decides what reads back: a written form is taken
 * only when it parses, as a node of its own with no annotation, to the name.
 */
import type { NameSyntax, Range } from '@mermaid-js/core/parser-kit';
import { writtenName } from '../parser/convert.ts';
import { parseTreeView } from '../parser/index.ts';

const DQ = '"';
const SQ = "'";
const HEAD = 'treeView-beta\n  x\n  ';

/** Whether `written`, as a node's name on a line of its own, reads as `name` (a directory when `directory`). */
function readsAs(written: string, name: string, directory: boolean): boolean {
  const r = parseTreeView(`${HEAD}${written}\n  y\n`);
  if (r.diagnostics.length > 0 || r.model.nodes.length !== 3) return false;
  const n = r.model.nodes[1];
  return (
    n !== undefined &&
    n.name === name &&
    n.directory === directory &&
    n.depth === 0 &&
    n.icon === undefined &&
    n.cssClass === undefined &&
    n.description === undefined
  );
}

/** `name` (a directory's with its `/`) in quote `q`, if that reads back. */
function quoted(name: string, directory: boolean, q: string): string | undefined {
  if (name.includes(q)) return undefined;
  const w = `${q}${writtenName(name, directory)}${q}`;
  return readsAs(w, name, directory) ? w : undefined;
}

/** `name` (a directory's with its `/`) written bare, if that reads back. */
function bare(name: string, directory: boolean): string | undefined {
  const w = writtenName(name, directory);
  return readsAs(w, name, directory) ? w : undefined;
}

/** Why `name` cannot be a treeView node name, if it cannot (D487). */
export function nameReason(name: string): string | undefined {
  if (name.trim() === '') return 'A name cannot be empty.';
  if (/[\n\r]/.test(name)) return 'A name cannot hold a line break.';
  if (name.endsWith('/')) {
    return `\`${name}\` ends with \`/\`, which would make the node a directory: write the name without it (a directory keeps its own \`/\`).`;
  }
  if (bare(name, false) ?? quoted(name, false, DQ) ?? quoted(name, false, SQ)) return undefined;
  if (name.includes(DQ) && name.includes(SQ)) {
    return `\`${name}\` cannot be written: it holds both \`"\` and \`'\`, so neither quote can hold it, and it cannot be written bare either.`;
  }
  return `\`${name}\` cannot be written as a name: it does not read back as itself, bare or in quotes.`;
}

const isQuote = (c: string) => c === DQ || c === SQ;

/**
 * How treeView names are read and written ({@link NameSyntax}): the occurrence is the name as
 * written, inside its quotes if any; a rename writes the new name there, or rewrites the whole
 * name (quotes and `/` included) when it needs other quotes, or quotes it had not.
 */
export const treeViewNameSyntax: NameSyntax = {
  read(text, s) {
    // The symbol covers the name as written: its quotes and a directory's `/` included.
    let { start, end } = s.range;
    const q = text.charAt(start);
    let quote: string | undefined;
    if (isQuote(q) && end - start >= 2 && text.charAt(end - 1) === q) {
      quote = q;
      start++;
      end--;
    }
    if (end - start === s.name.length + 1 && text.charAt(end - 1) === '/') end--;
    if (text.slice(start, end) !== s.name) return undefined;
    return quote === undefined ? { range: { start, end } } : { range: { start, end }, quote };
  },
  write(newName, at, text) {
    const q = at.quote;
    const { start, end } = at.range;
    const directory = q === undefined ? text.charAt(end) === '/' : text.startsWith(`/${q}`, end);
    const tail = directory ? 1 : 0;
    if (q !== undefined && !newName.includes(q)) return { range: at.range, newText: newName };
    if (q === undefined && bare(newName, directory) !== undefined)
      return { range: at.range, newText: newName };
    // The whole name, its quotes and `/` included, written anew.
    const range: Range =
      q === undefined ? { start, end: end + tail } : { start: start - 1, end: end + tail + 1 };
    const other = q === DQ ? SQ : DQ;
    const forms =
      q === undefined
        ? [quoted(newName, directory, DQ), quoted(newName, directory, SQ)]
        : [quoted(newName, directory, other), bare(newName, directory)];
    const newText = forms.find((f) => f !== undefined) ?? writtenName(newName, directory);
    return { range, newText };
  },
};
