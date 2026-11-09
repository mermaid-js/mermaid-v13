/**
 * Sankey node names for the language service (D398): which names v12 reads back, and how a
 * name is read from and written into a CSV field.
 *
 * A field is bare (`{TEXTDATA}`: printable ASCII but `"` and `,`, read trimmed) or quoted
 * (`"…"`, which also holds `,` and line breaks, `""` read as `"`, also trimmed). A rename keeps
 * the way each occurrence is written: inside quotes it doubles `"`; a bare occurrence takes
 * quotes when the new name needs them.
 */
import type { NameSyntax, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import { fieldName } from '../parser/names.ts';

/** A character a sankey name may hold: printable ASCII, or a line break (in quotes). */
const NAME_CHARS = /^[\x20-\x7e\n]*$/;
/** What only a quoted field holds. */
const NEEDS_QUOTES = /[,"\n]/;
/** An entity as v12 encodes it before lexing (`#35;`). */
const ENTITY = /#\w+;/;
const BLANK = /\s/;

/** Why `name` cannot be a sankey node name, or `undefined` when it can. */
export function invalidReason(name: string, _kind?: string): string | undefined {
  if (name.trim() === '') return 'A node name cannot be empty.';
  if (!NAME_CHARS.test(name))
    return `'${name}' has a character outside printable ASCII: sankey names take printable ASCII only (and line breaks, in quotes).`;
  if (BLANK.test(name.charAt(0)) || BLANK.test(name.charAt(name.length - 1)))
    return `'${name}' starts or ends with a blank, and sankey reads each field trimmed.`;
  if (name.includes('\n\n'))
    return `'${name}' has a blank line, and sankey reads a run of line breaks as one.`;
  if (ENTITY.test(name)) return `'${name}' has an entity (\`#…;\`), which sankey does not read.`;
  return undefined;
}

/**
 * The blank a field may take around its text: a space (a tab is no `{TEXTDATA}`, so no field
 * holds one).
 */
export const isFieldBlank = (ch: string): boolean => ch === ' ';

const isLineBreak = (ch: string) => ch === '\n' || ch === '\r';

/** The line or lines `[start, end)` is on (a scan of those lines only). */
function lineAround(text: string, start: number, end: number): string {
  let from = start;
  while (from > 0 && !isLineBreak(text.charAt(from - 1))) from--;
  let to = end;
  while (to < text.length && !isLineBreak(text.charAt(to))) to++;
  return text.slice(from, to);
}

/**
 * Whether v12 may read a line differently once a name on it changes: `encodeEntities` drops
 * the last `;` of a line holding `style…:…#…;` (or `classDef…`), so renaming `style` in
 * `style,b,1 :#f;` turns `#f;` into an entity, which v12 rejects.
 */
const rewrittenLine = (line: string) =>
  line.includes(';') && (line.includes('style') || line.includes('classDef'));

/**
 * Where an occurrence writes its name: the bare field, or the text between its quotes. None
 * (the service then refuses its rename) where v12 read other text than the source holds, or
 * on a line v12 may rewrite ({@link rewrittenLine}).
 */
function read(text: string, s: SymbolOccurrence): { range: Range; quote?: string } | undefined {
  const { start, end } = s.range;
  if (rewrittenLine(lineAround(text, start, end))) return;
  if (end - start === s.name.length && text.startsWith(s.name, start)) return { range: s.range };
  if (end - start < 2 || text.charAt(start) !== '"' || text.charAt(end - 1) !== '"') return;
  // Not the name when v12 read other text there (a CRLF, a collapsed blank line, a comment).
  if (fieldName(text.slice(start + 1, end - 1)) !== s.name) return;
  return { range: { start: start + 1, end: end - 1 }, quote: '"' };
}

/** `name` as a field written with `quote` (inside them), or bare: quoted when it must be. */
export function fieldText(name: string, quote: string | undefined): string {
  const escaped = name.replaceAll('"', '""');
  if (quote !== undefined) return escaped;
  return NEEDS_QUOTES.test(name) ? `"${escaped}"` : name;
}

/**
 * `range` with the blanks around it in its field: a quoted field starts at its `"` and ends
 * at its closing one (`  "a"` is no field), so a name quoted in place takes them.
 */
export function withFieldBlanks(text: string, range: Range): Range {
  let { start, end } = range;
  while (start > 0 && isFieldBlank(text.charAt(start - 1))) start--;
  while (isFieldBlank(text.charAt(end))) end++;
  return { start, end };
}

/** The edit naming an occurrence `name`: the text in place, quoted with its blanks if needed. */
function write(
  name: string,
  at: { readonly range: Range; readonly quote?: string },
  text: string
): { range: Range; newText: string } {
  const newText = fieldText(name, at.quote);
  const quotes = at.quote === undefined && newText !== name;
  return { range: quotes ? withFieldBlanks(text, at.range) : at.range, newText };
}

export const sankeyNames: NameSyntax = { read, write };
