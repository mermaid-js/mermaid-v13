/**
 * Definition, references and rename (D92) from the parser's symbol occurrences, grouped by the
 * facet's namespaces: an occurrence's name space is every kind in its group, so an edge to a
 * subgraph id finds the subgraph. The definition is the first `def` in source order.
 */
import type { LanguageFacet, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';
import { deepFreeze } from './freeze.ts';

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
export type RenameResult = { edits: readonly TextEdit[] } | { refused: string };

/** Namespace key of each symbol kind: its facet group's index, else the kind itself. */
function spaces(facet: LanguageFacet): (kind: string) => string {
  const spaceOf = new Map<string, string>();
  facet.namespaces.forEach((group, i) => {
    for (const kind of group) if (!spaceOf.has(kind)) spaceOf.set(kind, String(i));
  });
  return (kind) => spaceOf.get(kind) ?? `kind:${kind}`;
}

/**
 * Occurrences in source order, frozen. A symbol whose range does not hold exactly its name is
 * left out, so a rename never edits text that is not the name (the rename check then refuses).
 */
export function occurrences(ctx: DocumentContext): readonly Occurrence[] {
  const { result, facet, text } = ctx;
  if (!result || !facet) return [];
  const spaceOf = spaces(facet);
  const out: Occurrence[] = [];
  for (const s of result.symbols) {
    const { start, end } = s.range;
    if (s.name === '' || text.slice(start, end) !== s.name) continue;
    const space = spaceOf(s.kind);
    out.push({ name: s.name, kind: s.kind, role: s.role, range: { start, end }, space });
  }
  return deepFreeze(out.sort((a, b) => a.range.start - b.range.start));
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

/**
 * The defining occurrence: the first `def`, else the first mention. A block declaration (a
 * `subgraph`) wins over a node mention that created the name first: in v12 an edge to a
 * subgraph id is an edge to the subgraph, wherever the subgraph is written.
 */
export function definitionOf(all: readonly Occurrence[]): Occurrence | undefined {
  return (
    all.find((x) => x.role === 'def' && x.kind === 'subgraph') ??
    all.find((x) => x.role === 'def') ??
    all[0]
  );
}

export function definition(list: readonly Occurrence[], offset: number): Range | undefined {
  const o = occurrenceAt(list, offset);
  return o && definitionOf(sameSymbol(list, o))?.range;
}

export function references(
  list: readonly Occurrence[],
  offset: number,
  includeDeclaration: boolean
): readonly Range[] {
  const o = occurrenceAt(list, offset);
  if (!o) return Object.freeze([]);
  const all = sameSymbol(list, o);
  const def = definitionOf(all);
  return Object.freeze(all.filter((x) => includeDeclaration || x !== def).map((x) => x.range));
}

const noun = (kind: string) => (kind === 'class' ? 'class name' : `${kind} id`);

/** Why `ctx` has no symbols to work with, when it has no facet. */
function unsupported(ctx: DocumentContext): string | undefined {
  if (ctx.facet) return undefined;
  if (ctx.entry && ctx.notLoaded)
    return `The ${ctx.entry.id} language support is not loaded (\`service.preload()\`).`;
  if (ctx.entry && ctx.loadError !== undefined)
    return `The ${ctx.entry.id} language support could not be loaded (${ctx.loadError}).`;
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
  if (reason) return deepFreeze({ refused: reason });
  const o = occurrenceAt(list, offset);
  if (!o) return deepFreeze({ refused: 'There is no id or class name here to rename.' });
  return deepFreeze({ range: o.range, placeholder: o.name });
}

/** `text` with `edits` (non-overlapping) applied. */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.range.start - a.range.start))
    out = out.slice(0, e.range.start) + e.newText + out.slice(e.range.end);
  return out;
}

/**
 * Whether renaming `o`'s symbol by `edits` reads back the same (D92): re-parsed, the text has
 * as many symbols as before, and the symbols named `newName` in the namespace are exactly
 * the renamed occurrences, at their new ranges and with their old kinds. `isValidId` checks a
 * name alone; this catches what the neighbours do to it (`A-->B` to `x--->B`, `B---A` to
 * `B---o`).
 */
function readsBack(
  ctx: DocumentContext,
  facet: LanguageFacet,
  o: Occurrence,
  edits: readonly TextEdit[],
  newName: string
): boolean {
  const before = ctx.result?.symbols ?? [];
  const spaceOf = spaces(facet);
  const byStart = (list: readonly SymbolOccurrence[]) => [
    ...new Map(list.map((s) => [s.range.start, s] as const)).values(),
  ];
  const renamed = byStart(before.filter((s) => spaceOf(s.kind) === o.space && s.name === o.name));
  if (renamed.length !== edits.length) return false;
  const after = facet.parse(applyEdits(ctx.text, edits), { keepTokens: true }).symbols;
  if (after.length !== before.length) return false;
  const got = byStart(after.filter((s) => spaceOf(s.kind) === o.space && s.name === newName))
    .map((s) => `${s.range.start}:${s.range.end}:${s.kind}`)
    .sort();
  // Where each renamed occurrence lands: shifted by the length change of the edits before it.
  const delta = newName.length - o.name.length;
  const sorted = [...renamed].sort((a, b) => a.range.start - b.range.start);
  const want = sorted
    .map((s, i) => `${s.range.start + i * delta}:${s.range.end + (i + 1) * delta}:${s.kind}`)
    .sort();
  return got.length === want.length && got.every((g, i) => g === want[i]);
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
  const facet = ctx.facet!;
  const refuse = (refused: string): RenameResult => deepFreeze({ refused });
  const invalid = facet.isValidId(newName, o.kind);
  if (invalid !== undefined) return refuse(invalid);
  const edits = sameSymbol(list, o).map((x) => ({ range: x.range, newText: newName }));
  if (newName === o.name) return deepFreeze({ edits });
  const clash = list.find((x) => x.space === o.space && x.name === newName);
  if (clash) return refuse(`'${newName}' is already a ${noun(clash.kind)} in this diagram.`);
  if (!readsBack(ctx, facet, o, edits, newName))
    return refuse(`'${newName}' would not read as the same ${noun(o.kind)} everywhere it is used.`);
  return deepFreeze({ edits });
}
