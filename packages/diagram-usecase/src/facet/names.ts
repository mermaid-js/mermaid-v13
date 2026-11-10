/**
 * How usecase names are read and written for definition, references and rename (D477, D191,
 * D92), as the facet's `nameSyntax`.
 *
 * A bare id (`User`, `e1`) is its symbol's name. A quoted element (`"Reset password"`, or a
 * Markdown text) is named by its label, the text between the quotes, and its id is the label
 * with every non-word character as `_` (`Reset_password`). A bare mention of that id
 * (`note for Reset_password`, `class Reset_password hot`, which take ids only) is one of the same
 * symbol (#563). So a rename writes the new name between the quotes it is written in, and the
 * new name's id at the bare occurrences: renaming `"Reset password"` to `Change password` writes
 * `"Change password"` and `Change_password`. A bare id renamed to a name that is not `\w+` is
 * written as that name's id, which then reads as another name, so the service's read-back
 * refuses it. An occurrence whose text does not read as its name (a label with an entity code,
 * a quoted mention whose label differs from the first) is not read: a rename of its symbol is
 * refused, since it would not be renamed.
 */
import type { NameSyntax, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { PLANTUML } from '../parser/tables.ts';
import { generatedId } from '../parser/text.ts';
import { isKeyword } from './tables.ts';

/** The quotes a name may be written in, longest first. */
const QUOTES: readonly (readonly [open: string, close: string])[] = [
  ['"`', '`"'],
  ['"', '"'],
  ["'", "'"],
];

/**
 * `undefined` when `name` can be the name of a symbol of `kind` (`actor`, the default,
 * `usecase`, `boundary`, `json`, `edge`), else why not. An edge id and a JSON table's id are
 * bare ids only; an actor, use case or boundary may also be a quoted label.
 */
export function invalidReason(name: string, kind = 'actor'): string | undefined {
  if (name.trim() === '') return 'A usecase name cannot be empty.';
  if (/[\r\n]/.test(name)) return `'${name}' cannot be a usecase name: it has a line break.`;
  if (name.includes('"')) return `'${name}' cannot be a usecase name: it has a \`"\`.`;
  if (isKeyword(name)) return `'${name}' is a usecase keyword.`;
  if (PLANTUML.has(name.toLowerCase())) {
    return `'${name}' is PlantUML syntax, which a usecase statement cannot start with.`;
  }
  if ((kind === 'edge' || kind === 'json') && !/^\w+$/.test(name)) {
    const what = kind === 'edge' ? 'A relation id' : "A JSON table's id";
    return `'${name}' is not a usecase id: ${what.toLowerCase()} is ASCII letters, digits and \`_\`.`;
  }
  return undefined;
}

/** The quote pair `[start, end)` of `text` is written in, if any. */
function quoteOf(text: string, start: number, end: number) {
  for (const [open, close] of QUOTES) {
    if (end - start < open.length + close.length) continue;
    if (text.startsWith(open, start) && text.startsWith(close, end - close.length)) {
      return { open, inner: { start: start + open.length, end: end - close.length } };
    }
  }
  return undefined;
}

/** Where symbol `s` writes its name, or undefined when the text there does not read as it. */
function read(text: string, s: SymbolOccurrence): { range: Range; quote?: string } | undefined {
  const { start, end } = s.range;
  const q = quoteOf(text, start, end);
  if (q) {
    return text.slice(q.inner.start, q.inner.end) === s.name
      ? { range: q.inner, quote: q.open }
      : undefined;
  }
  const written = text.slice(start, end);
  // A bare id: the symbol's own name, or the id of a quoted element's label.
  return written === s.name || written === generatedId(s.name) ? { range: s.range } : undefined;
}

/** The edit renaming one occurrence to `newName`: between its quotes, else as its id. */
function write(
  newName: string,
  at: { readonly range: Range; readonly quote?: string }
): { range: Range; newText: string } {
  return { range: at.range, newText: at.quote === undefined ? generatedId(newName) : newName };
}

export const NAME_SYNTAX: NameSyntax = { read, write };
