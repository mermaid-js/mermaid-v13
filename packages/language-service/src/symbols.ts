/**
 * Definition, references and rename (D92) from the parser's symbol occurrences, grouped by the
 * facet's namespaces: an occurrence's name space is every kind in its group, so an edge to a
 * subgraph id finds the subgraph. The definition is the first `def` in source order.
 */
import type { Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';

/** A symbol occurrence whose range covers exactly its name, with its namespace. */
export interface Occurrence extends SymbolOccurrence {
  /** Namespace key: the index of the facet group holding `kind`, else the kind itself. */
  readonly space: string;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export type PrepareRenameResult = { range: Range; placeholder: string } | { refused: string };
export type RenameResult = { edits: TextEdit[] } | { refused: string };

/**
 * Occurrences in source order. A range that holds more than the name (some statements give
 * the whole statement) is narrowed to the name's last occurrence in it; one that does not
 * hold the name at all is dropped, so a rename never edits text that is not the name.
 */
export function occurrences(ctx: DocumentContext): Occurrence[] {
  const { result, facet, text } = ctx;
  if (!result || !facet) return [];
  const spaceOf = new Map<string, string>();
  facet.namespaces.forEach((group, i) => {
    for (const kind of group) if (!spaceOf.has(kind)) spaceOf.set(kind, String(i));
  });
  const out: Occurrence[] = [];
  for (const s of result.symbols) {
    let { start, end } = s.range;
    if (text.slice(start, end) !== s.name) {
      const i = text.slice(start, end).lastIndexOf(s.name);
      if (s.name === '' || i < 0) continue;
      start += i;
      end = start + s.name.length;
    }
    const space = spaceOf.get(s.kind) ?? `kind:${s.kind}`;
    out.push({ name: s.name, kind: s.kind, role: s.role, range: { start, end }, space });
  }
  return out.sort((a, b) => a.range.start - b.range.start);
}

/** The occurrence under `offset`: one containing it, else one ending at it. */
function occurrenceAt(list: readonly Occurrence[], offset: number): Occurrence | undefined {
  let touching: Occurrence | undefined;
  for (const o of list) {
    if (o.range.start > offset) break;
    if (offset < o.range.end) return o;
    if (offset === o.range.end) touching = o;
  }
  return touching;
}

/** Every occurrence of `o`'s name in its namespace, one per range, in source order. */
function sameSymbol(list: readonly Occurrence[], o: Occurrence): Occurrence[] {
  const out: Occurrence[] = [];
  for (const x of list) {
    if (x.space !== o.space || x.name !== o.name) continue;
    const last = out[out.length - 1];
    if (last?.range.start === x.range.start) continue;
    out.push(x);
  }
  return out;
}

/** The defining occurrence: the first `def`, else the first mention. */
export function definitionOf(all: readonly Occurrence[]): Occurrence | undefined {
  return all.find((x) => x.role === 'def') ?? all[0];
}

export function definition(list: readonly Occurrence[], offset: number): Range | undefined {
  const o = occurrenceAt(list, offset);
  return o && definitionOf(sameSymbol(list, o))?.range;
}

export function references(
  list: readonly Occurrence[],
  offset: number,
  includeDeclaration: boolean
): Range[] {
  const o = occurrenceAt(list, offset);
  if (!o) return [];
  const all = sameSymbol(list, o);
  const def = definitionOf(all);
  return all.filter((x) => includeDeclaration || x !== def).map((x) => x.range);
}

const noun = (kind: string) => (kind === 'class' ? 'class name' : `${kind} id`);

/** Why `ctx` has no symbols to work with, when it has no facet. */
function unsupported(ctx: DocumentContext): string | undefined {
  if (ctx.facet) return undefined;
  return ctx.entry
    ? `${ctx.entry.type} diagrams are not supported by the v13 language service yet.`
    : 'The diagram type is not recognised.';
}

export function prepareRename(
  ctx: DocumentContext,
  list: readonly Occurrence[],
  offset: number
): PrepareRenameResult {
  const reason = unsupported(ctx);
  if (reason) return { refused: reason };
  const o = occurrenceAt(list, offset);
  if (!o) return { refused: 'There is no id or class name here to rename.' };
  return { range: o.range, placeholder: o.name };
}

export function rename(
  ctx: DocumentContext,
  list: readonly Occurrence[],
  offset: number,
  newName: string
): RenameResult {
  const prepared = prepareRename(ctx, list, offset);
  if ('refused' in prepared) return prepared;
  const o = occurrenceAt(list, offset)!;
  const invalid = ctx.facet?.isValidId(newName);
  if (invalid !== undefined) return { refused: invalid };
  if (newName !== o.name) {
    const clash = list.find((x) => x.space === o.space && x.name === newName);
    if (clash) return { refused: `'${newName}' is already a ${noun(clash.kind)} in this diagram.` };
  }
  return { edits: sameSymbol(list, o).map((x) => ({ range: x.range, newText: newName })) };
}
