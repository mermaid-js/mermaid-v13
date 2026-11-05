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
  /** The opening quote the name is written in (`"Customer Account"`), when it is (#199). */
  readonly quote?: string;
}

/**
 * Opening quotes a name may be written in, its range then covering the quotes (#199): a
 * flowchart markdown string (a backtick pair inside a double-quote pair) is a quote inside a
 * quote; a pie label may be written in `'…'` (#307).
 */
const QUOTES = ['"`', '"', '`', "'"];
/** The closing quote of an opening one. */
const closing = (quote: string) => [...quote].reverse().join('');
/** Each of {@link QUOTES} with its closing quote. */
const QUOTE_PAIRS = QUOTES.map((q) => [q, closing(q)] as const);

/**
 * The opening quote `name` is written in at `[start, end)` of `text`, if it is. Compares in
 * place: this runs for every symbol of every parse (semantic tokens read it first).
 */
function quoteAround(text: string, start: number, end: number, name: string): string | undefined {
  for (const [open, close] of QUOTE_PAIRS) {
    if (end - start !== name.length + open.length + close.length) continue;
    if (
      text.startsWith(open, start) &&
      text.startsWith(name, start + open.length) &&
      text.startsWith(close, end - close.length)
    )
      return open;
  }
  return undefined;
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
 * A name written in quotes (`subgraph "One"`, ER `"Customer Account"`, a class name in
 * backticks) is recorded with the quotes' range: its occurrence is the text between
 * them, so it is the same symbol as the name written bare, and a rename keeps the quotes (#199).
 */
export function occurrences(ctx: DocumentContext): readonly Occurrence[] {
  const { result, facet, text } = ctx;
  if (!result || !facet) return [];
  const spaceOf = spaces(facet);
  const out: Occurrence[] = [];
  for (const s of result.symbols) {
    let { start, end } = s.range;
    if (s.name === '') continue;
    const bare = end - start === s.name.length && text.startsWith(s.name, start);
    const quote = bare ? undefined : quoteAround(text, start, end, s.name);
    if (quote) {
      start += quote.length;
      end -= quote.length;
    } else if (!bare) continue;
    const space = spaceOf(s.kind);
    const o = { name: s.name, kind: s.kind, role: s.role, range: { start, end }, space };
    out.push(quote ? { ...o, quote } : o);
  }
  return deepFreeze(out.sort((a, b) => a.range.start - b.range.start));
}

/**
 * The occurrence under `offset`: the innermost one containing it, else one ending at it.
 * Occurrences nest only where a name is made of others (the node names inside a generated
 * flowchart edge id, `L_B_D_0`).
 */
export function occurrenceAt(list: readonly Occurrence[], offset: number): Occurrence | undefined {
  let touching: Occurrence | undefined;
  let inner: Occurrence | undefined;
  const size = (o: Occurrence) => o.range.end - o.range.start;
  for (const o of list) {
    if (o.range.start > offset) break;
    if (offset < o.range.end) {
      if (!inner || size(o) < size(inner)) inner = o;
    } else if (offset === o.range.end) touching = o;
  }
  return inner ?? touching;
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
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
/** `noun(kind)` with its article (`an entity id`). */
const aNoun = (kind: string) =>
  `${VOWELS.has(kind.charAt(0).toLowerCase()) ? 'an' : 'a'} ${noun(kind)}`;

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

/** `text` with `edits` (non-overlapping) applied, in one pass: O(text + edits). */
function applyEdits(text: string, edits: readonly TextEdit[]): string {
  const parts: string[] = [];
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.range.start - b.range.start)) {
    parts.push(text.slice(at, e.range.start), e.newText);
    at = e.range.end;
  }
  parts.push(text.slice(at));
  return parts.join('');
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

/** Why `newName` cannot go between the quotes of a quoted occurrence in `all` (#199). */
function quotedReason(all: readonly Occurrence[], newName: string): string | undefined {
  for (const { quote } of all) {
    if (quote === undefined) continue;
    if ([...quote].some((q) => newName.includes(q)) || /[\r\n]/.test(newName))
      return `'${newName}' cannot be written inside ${quote}…${closing(quote)}.`;
    if (newName.trim() === '') return 'A quoted name cannot be empty.';
  }
  return undefined;
}

/**
 * The facet's reason against `newName`, when any occurrence is written bare. Between quotes a
 * name takes more (`Client Account`); the read-back check still has the last word.
 */
function bareReason(
  facet: LanguageFacet,
  all: readonly Occurrence[],
  newName: string,
  kind: string
): string | undefined {
  return all.some((x) => x.quote === undefined) ? facet.isValidId(newName, kind) : undefined;
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
  const all = sameSymbol(list, o);
  const invalid = quotedReason(all, newName) ?? bareReason(facet, all, newName, o.kind);
  if (invalid !== undefined) return refuse(invalid);
  const edits = all.map((x) => ({ range: x.range, newText: newName }));
  if (newName === o.name) return deepFreeze({ edits });
  const clash = list.find((x) => x.space === o.space && x.name === newName);
  if (clash) return refuse(`'${newName}' is already ${aNoun(clash.kind)} in this diagram.`);
  if (!readsBack(ctx, facet, o, edits, newName))
    return refuse(`'${newName}' would not read as the same ${noun(o.kind)} everywhere it is used.`);
  return deepFreeze({ edits });
}
