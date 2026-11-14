/**
 * Definition, references and rename (D92) from the parser's symbol occurrences, grouped by the
 * facet's namespaces: an occurrence's name space is every kind in its group, so an edge to a
 * subgraph id finds the subgraph. The definition is the first `def` in source order. An
 * occurrence of one of the facet's `standalone` kinds is a symbol of its own (mindmap node
 * ids, D289): its name space is its group and its place.
 */
import type { LanguageFacet, Range, SymbolOccurrence } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';
import { deepFreeze } from './freeze.ts';

/**
 * A symbol occurrence whose range covers exactly its name (with a facet's `nameSyntax`, the
 * text written for it), with its namespace.
 */
export interface Occurrence extends SymbolOccurrence {
  /**
   * Namespace key: the index of the facet group holding `kind`, else the kind itself; for a
   * `standalone` kind, also the start of the occurrence as recorded.
   */
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

/**
 * Namespace key of each recorded symbol: its kind's facet group index, else the kind itself;
 * a symbol of a `standalone` kind adds its recorded start, so it shares its key with no other.
 * A rename's single edit keeps that start, so the renamed symbol keeps its key.
 */
function spaces(facet: LanguageFacet): (s: SymbolOccurrence) => string {
  const spaceOf = new Map<string, string>();
  facet.namespaces.forEach((group, i) => {
    for (const kind of group) if (!spaceOf.has(kind)) spaceOf.set(kind, String(i));
  });
  const standalone = new Set(facet.standalone ?? []);
  return (s) => {
    const space = spaceOf.get(s.kind) ?? `kind:${s.kind}`;
    return standalone.has(s.kind) ? `${space}@${s.range.start}` : space;
  };
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
  const syntax = facet.nameSyntax;
  for (const s of result.symbols) {
    if (s.name === '') continue;
    if (syntax) {
      const read = syntax.read(text, s);
      if (!read) continue;
      const o = { name: s.name, kind: s.kind, role: s.role, range: read.range, space: spaceOf(s) };
      out.push(read.quote === undefined ? o : { ...o, quote: read.quote });
      continue;
    }
    let { start, end } = s.range;
    const bare = end - start === s.name.length && text.startsWith(s.name, start);
    const quote = bare ? undefined : quoteAround(text, start, end, s.name);
    if (quote) {
      start += quote.length;
      end -= quote.length;
    } else if (!bare) continue;
    const space = spaceOf(s);
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
 * The defining occurrence: the first `def`, else the first mention (none with `declaredOnly`,
 * {@link LanguageFacet.declaredOnly}). A block declaration (a
 * `subgraph`) wins over a node mention that created the name first: in v12 an edge to a
 * subgraph id is an edge to the subgraph, wherever the subgraph is written.
 */
export function definitionOf(
  all: readonly Occurrence[],
  declaredOnly = false
): Occurrence | undefined {
  return (
    all.find((x) => x.role === 'def' && x.kind === 'subgraph') ??
    all.find((x) => x.role === 'def') ??
    (declaredOnly ? undefined : all[0])
  );
}

export function definition(
  list: readonly Occurrence[],
  offset: number,
  declaredOnly = false
): Range | undefined {
  const o = occurrenceAt(list, offset);
  return o && definitionOf(sameSymbol(list, o), declaredOnly)?.range;
}

export function references(
  list: readonly Occurrence[],
  offset: number,
  includeDeclaration: boolean,
  declaredOnly = false
): readonly Range[] {
  const o = occurrenceAt(list, offset);
  if (!o) return Object.freeze([]);
  const all = sameSymbol(list, o);
  const def = definitionOf(all, declaredOnly);
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
 * `B---o`). An edit that rewrites the whole token around an occurrence (a name inside a
 * longer one, quoted, `"note_Gas"`) holds its renamed occurrences somewhere in its new text.
 * `clash`: the new text reads as names already in the namespace (the new name is one, as a
 * pipeline component's id `Kettle_Gas` is the names `Kettle` and `Gas` in wardley).
 */
function readsBack(
  ctx: DocumentContext,
  facet: LanguageFacet,
  o: Occurrence,
  edits: readonly TextEdit[],
  newName: string
): 'same' | 'clash' | 'differs' {
  const before = ctx.result?.symbols ?? [];
  const spaceOf = spaces(facet);
  const after = facet.parse(applyEdits(ctx.text, edits), { keepTokens: true }).symbols;
  // Each edit's place in the new text: shifted by the length change of the edits before it.
  const sorted = [...edits].sort((a, b) => a.range.start - b.range.start);
  let shift = 0;
  const placed = sorted.map((e) => {
    const start = e.range.start + shift;
    const delta = e.newText.length - (e.range.end - e.range.start);
    shift += delta;
    return { e, start, end: start + e.newText.length, shift: start - e.range.start, delta };
  });
  if (sameSymbols(before, after, placed, facet, o, newName)) return 'same';
  // Why not: the new text reads as names the namespace already has, that were not there.
  const names = new Set(before.filter((s) => spaceOf(s) === o.space).map((s) => s.name));
  const within = (list: readonly SymbolOccurrence[], start: number, end: number) =>
    list.filter((s) => spaceOf(s) === o.space && start <= s.range.start && s.range.end <= end);
  for (const p of placed) {
    const was = new Set(within(before, p.e.range.start, p.e.range.end).map((s) => s.name));
    const now = within(after, p.start, p.end);
    if (now.some((s) => s.name !== newName && names.has(s.name) && !was.has(s.name)))
      return 'clash';
  }
  return 'differs';
}

interface Placed {
  readonly e: TextEdit;
  /** The edit's new text in the new text. */
  readonly start: number;
  readonly end: number;
  /** How far the text before the edit moved. */
  readonly shift: number;
  /** The edit's own length change. */
  readonly delta: number;
}

/**
 * Whether the symbols after the edits are those before, with `o`'s renamed: as many, and the
 * ones named `newName` in the namespace exactly the renamed ones, at their new places. An edit
 * inside an occurrence (its name, between quotes or not) places it exactly, as does every edit
 * of a facet's `nameSyntax` (which may take the blanks around a field); an edit that
 * rewrote a token around occurrences holds them somewhere in its new text.
 */
function sameSymbols(
  before: readonly SymbolOccurrence[],
  after: readonly SymbolOccurrence[],
  placed: readonly Placed[],
  facet: LanguageFacet,
  o: Occurrence,
  newName: string
): boolean {
  if (after.length !== before.length) return false;
  const spaceOf = spaces(facet);
  const syntax = facet.nameSyntax !== undefined;
  const byStart = (list: readonly SymbolOccurrence[]) => [
    ...new Map(list.map((s) => [s.range.start, s] as const)).values(),
  ];
  const renamed = byStart(before.filter((s) => spaceOf(s) === o.space && s.name === o.name)).sort(
    (a, b) => a.range.start - b.range.start
  );
  // A name syntax writes one edit per occurrence, over it (and maybe the blanks around it).
  if (syntax && renamed.length !== placed.length) return false;
  const exact = new Set<string>();
  const loose: { start: number; end: number; kind: string }[] = [];
  let i = 0;
  for (const s of renamed) {
    // The edit over this occurrence: the edits are in order, and so are the occurrences.
    while (i < placed.length && (placed[i]?.e.range.end ?? 0) <= s.range.start) i++;
    const p = placed[i];
    if (!p || p.e.range.start >= s.range.end) return false;
    // Placed exactly: over its range and its edit's, shifted by the length change of the edits
    // before it, its end also by its own (an edit inside it changes it by `delta` alone).
    if (syntax || (s.range.start <= p.e.range.start && p.e.range.end <= s.range.end)) {
      const start = Math.min(s.range.start, p.e.range.start) + p.shift;
      const end = Math.max(s.range.end, p.e.range.end) + p.shift + p.delta;
      exact.add(`${start}:${end}:${s.kind}`);
    } else loose.push({ start: p.start, end: p.end, kind: s.kind });
  }
  const got = byStart(after.filter((s) => spaceOf(s) === o.space && s.name === newName));
  if (got.length !== renamed.length) return false;
  for (const s of got) {
    if (exact.delete(`${s.range.start}:${s.range.end}:${s.kind}`)) continue;
    const j = loose.findIndex(
      (l) => l.kind === s.kind && l.start <= s.range.start && s.range.end <= l.end
    );
    if (j < 0) return false;
    loose.splice(j, 1);
  }
  return exact.size === 0 && loose.length === 0;
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
 * What a rename writes at the bare occurrences in `all`: `newName`, or the facet's quoted form
 * of it when `isValidId` refuses it bare and the facet can quote it
 * ({@link LanguageFacet.quoteId}); else the facet's reason. Between quotes a name takes more
 * (`Client Account`); the read-back check still has the last word.
 */
function bareText(
  facet: LanguageFacet,
  all: readonly Occurrence[],
  newName: string,
  kind: string
): { text: string } | { refused: string } {
  if (all.every((x) => x.quote !== undefined)) return { text: newName };
  const reason = facet.isValidId(newName, kind);
  if (reason === undefined) return { text: newName };
  const quoted = facet.quoteId?.(newName, kind);
  return quoted === undefined ? { refused: reason } : { text: quoted };
}

/**
 * How a bare occurrence of each kind writes the new name: `bare` (from {@link bareText}), or,
 * when that is `newName` itself, the facet's written form of it for the occurrence's kind
 * ({@link LanguageFacet.writtenName}: xychart quotes `Q1 2024`, D389), asked once per kind.
 */
function writtenAs(facet: LanguageFacet, newName: string, bare: string): (kind: string) => string {
  if (bare !== newName || !facet.writtenName) return () => bare;
  const byKind = new Map<string, string>();
  return (kind) => {
    let w = byKind.get(kind);
    if (w === undefined) byKind.set(kind, (w = facet.writtenName?.(newName, kind) ?? newName));
    return w;
  };
}

/** The smallest non-empty token of the parse holding `r`. */
function tokenAround(ctx: DocumentContext, r: Range): Range | undefined {
  const tokens = ctx.result?.tokens;
  let best: Range | undefined;
  for (let j = 0; tokens && j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (start > r.start) break;
    if (end < r.end || end === start) continue;
    if (!best || end - start < best.end - best.start) best = { start, end };
  }
  return best;
}

/**
 * The edits renaming `all` to `newName`. Where the name must be quoted (`bareOf` gives the
 * quoted form for the occurrence's kind) and an occurrence sits inside a longer token, a part of another name (a wardley
 * pipeline component's id `Kettle_Gas`), quotes cannot go around the part: the whole token is
 * rewritten and quoted (`"note_Gas"`); inside a token already quoted the name goes in as it is.
 */
function renameEdits(
  ctx: DocumentContext,
  facet: LanguageFacet,
  all: readonly Occurrence[],
  newName: string,
  bareOf: (kind: string) => string,
  kind: string
): TextEdit[] | { refused: string } {
  const edits: TextEdit[] = [];
  const parts = new Map<number, { token: Range; inside: Occurrence[] }>();
  for (const x of all) {
    const bare = bareOf(x.kind);
    const token = x.quote === undefined && bare !== newName ? tokenAround(ctx, x.range) : undefined;
    if (!token || (token.start === x.range.start && token.end === x.range.end)) {
      edits.push({ range: x.range, newText: x.quote === undefined ? bare : newName });
      continue;
    }
    const group = parts.get(token.start) ?? { token, inside: [] };
    group.inside.push(x);
    parts.set(token.start, group);
  }
  for (const { token, inside } of parts.values()) {
    const text = ctx.text.slice(token.start, token.end);
    const pair = QUOTE_PAIRS.find(
      ([open, close]) =>
        text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)
    );
    if (pair) {
      const reason = quotedReason([{ ...inside[0]!, quote: pair[0] }], newName);
      if (reason !== undefined) return { refused: reason };
      for (const x of inside) edits.push({ range: x.range, newText: newName });
      continue;
    }
    let written = '';
    let at = token.start;
    for (const x of inside) {
      written += ctx.text.slice(at, x.range.start) + newName;
      at = x.range.end;
    }
    written += ctx.text.slice(at, token.end);
    const quoted = facet.quoteId?.(written, kind);
    if (quoted === undefined)
      return {
        refused: `'${newName}' needs quotes, and \`${text}\`, which holds it, cannot take them.`,
      };
    edits.push({ range: token, newText: quoted });
  }
  return edits;
}

const refuse = (refused: string): RenameResult => deepFreeze({ refused });

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
  // The facet's `isValidId`, `quoteId`, `writtenName`, name syntax and parse may throw (a
  // third-party facet): a refusal that says so, not a thrown query (R-LANG-4).
  try {
    return renameOccurrence(ctx, facet, list, o, newName);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return refuse(
      `The ${ctx.entry?.id ?? facet.id} language support failed on this rename (${why}).`
    );
  }
}

/** {@link rename} of the occurrence `o`, which the facet may refuse (or throw on). */
function renameOccurrence(
  ctx: DocumentContext,
  facet: LanguageFacet,
  list: readonly Occurrence[],
  o: Occurrence,
  newName: string
): RenameResult {
  const all = sameSymbol(list, o);
  const syntax = facet.nameSyntax;
  let edits: TextEdit[];
  if (syntax) {
    // A name syntax escapes what the quotes would not hold, so the facet judges every name.
    const invalid = facet.isValidId(newName, o.kind);
    if (invalid !== undefined) return refuse(invalid);
    edits = all.map((x) => syntax.write(newName, x, ctx.text));
  } else {
    const invalid = quotedReason(all, newName);
    if (invalid !== undefined) return refuse(invalid);
    const bare = bareText(facet, all, newName, o.kind);
    if ('refused' in bare) return refuse(bare.refused);
    const made = renameEdits(
      ctx,
      facet,
      all,
      newName,
      writtenAs(facet, newName, bare.text),
      o.kind
    );
    if ('refused' in made) return refuse(made.refused);
    edits = made;
  }
  if (newName === o.name) return deepFreeze({ edits });
  const clash = list.find((x) => x.space === o.space && x.name === newName);
  if (clash) return refuse(`'${newName}' is already ${aNoun(clash.kind)} in this diagram.`);
  const read = readsBack(ctx, facet, o, edits, newName);
  if (read === 'clash') return refuse(`'${newName}' is already ${aNoun(o.kind)} in this diagram.`);
  if (read === 'differs')
    return refuse(`'${newName}' would not read as the same ${noun(o.kind)} everywhere it is used.`);
  return deepFreeze({ edits });
}
