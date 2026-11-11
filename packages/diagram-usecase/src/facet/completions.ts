/**
 * Usecase completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds, gated by the
 * lexer mode, and the statement the cursor is in, mapped to items.
 *
 * - At the start of a line: `usecase-beta` where the header goes, else the statement keywords
 *   the parser expects there (`end` only inside a `systemBoundary`).
 * - Inside `@{ … }`: the keys the element's kind takes and the statement has not set yet,
 *   inserted as `key: `; after a key's `:`, its values (`type: hollow`, `business: true`). The
 *   kind is the statement's (`actor`, `systemBoundary`), else the one the name resolves to (an
 *   edge id, an actor declared elsewhere), else a use case's.
 * - Where an id goes: after an arrow and after `note for`, the declared actors and use cases;
 *   as a `class` or `style` target, every element with an id (boundaries, JSON tables and
 *   relation ids too); after `:::` and as the class names of `class`, the `classDef` names. A
 *   quoted element is offered by its id (`Reset_password`), which those places take bare, with
 *   its label as the detail. The word being typed is not offered as itself.
 * - Where an arrow goes: the arrow forms whose first token the parser expects.
 * - `direction ` the directions, `note ` `for`, `..> : ` `include` and `extend`.
 *
 * Nothing in a quoted text, a stereotype, a JSON object, an accessible title or description,
 * a comment, a directive or front matter.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { usecaseDocs } from '../generated/docs.ts';
import type { UsecaseModel } from '../model.ts';
import type { UsecaseDocument, UsecaseElementKind } from '../parser/ast.ts';
import { ARROW_SET, NAMES } from '../parser/tables.ts';
import { generatedId } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';
import {
  ARROW_FORMS,
  declaredOf,
  DIRECTIONS,
  isKeyword,
  KEYWORD_ITEMS,
  KIND_NAMES,
  METADATA_KEYS,
  span,
  tokenBefore,
} from './tables.ts';
import type { MetadataKind } from './tables.ts';
import { atLineStart } from '@mermaid-js/shared/parser/facet';
import { CompletionList as Items } from '@mermaid-js/shared/parser/facet';
import { wordRange } from '@mermaid-js/shared/parser/facet';

/** Where a statement ends. */
const LINE_BREAK = new Set<number>([Kind.Newline, Kind.EOF]);
/** Tokens a metadata block holds besides its braces. */
const IN_METADATA = new Set<number>([
  T.Identifier,
  T.PlainString,
  T.Colon,
  T.Comma,
  T.True,
  T.False,
  Kind.Newline,
]);
/** Ids, keywords and numbers: a cursor inside one replaces all of it. */
const WORDS = new Set<number>([T.Identifier, T.Number, ...KEYWORD_ITEMS.map((k) => k.kind)]);

/** The significant tokens of the cursor's line before `at`, as indexes into `tokens`. */
function lineBefore(tokens: TokenStream, at: number): number[] {
  const out: number[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.end[i] ?? 0) > at) continue;
    if (LINE_BREAK.has(k)) break;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    out.push(i);
  }
  return out.reverse();
}

/** The `@{` the cursor at `at` is inside (across lines), or -1. */
function openMetadata(tokens: TokenStream, at: number): number {
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.end[i] ?? 0) > at) continue;
    if (k === T.MetadataStart) return i;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    if (!IN_METADATA.has(k)) return -1;
  }
  return -1;
}

/** The token text of `j`, without the quotes of a quoted text. */
function nameText(text: string, tokens: TokenStream, j: number): string {
  const raw = text.slice(tokens.start[j] ?? 0, tokens.end[j] ?? 0);
  return tokens.kind[j] === T.PlainString ? raw.slice(1, -1) : raw;
}

/** The kind of the element whose `@{` is token `m`. */
function metadataKind(doc: DocumentView<UsecaseDocument>, tokens: TokenStream, m: number) {
  let j = m - 1;
  const close = tokens.kind[j];
  if (close === T.RParen || close === T.RBracket) {
    const open = close === T.RParen ? T.LParen : T.LBracket;
    while (j > 0 && tokens.kind[j] !== open) j--;
    j--;
  }
  if (j < 0 || !NAMES.includes(tokens.kind[j]!)) return undefined;
  const line = lineBefore(tokens, tokens.start[j] ?? 0);
  const head = line.length > 0 ? tokens.kind[line[0]!] : undefined;
  if (head === T.Actor && line.length === 1) return 'actor';
  if (head === T.SystemBoundary) return 'boundary';
  const at = tokens.start[j] ?? 0;
  // The name here, else (a statement that failed) the same name elsewhere.
  const word = nameText(doc.text, tokens, j);
  const symbol =
    doc.result.symbols.find((s) => s.range.start === at) ??
    doc.result.symbols.find((s) => s.name === word);
  const kind = symbol?.kind as UsecaseElementKind | undefined;
  if (kind === 'actor' || kind === 'usecase' || kind === 'boundary' || kind === 'edge') return kind;
  return head === T.Actor ? 'actor' : undefined;
}

/** Keys and values inside `@{ … }`. */
function metadata(
  items: Items,
  doc: DocumentView<UsecaseDocument>,
  tokens: TokenStream,
  m: number,
  at: number,
  expected: ReadonlySet<number>
): void {
  const kind: MetadataKind | undefined = metadataKind(doc, tokens, m);
  const fits = (k: (typeof METADATA_KEYS)[number]) => kind === undefined || k.kinds.includes(kind);
  // The tokens of the block before the word.
  const inside: number[] = [];
  for (let i = m + 1; i < tokens.length && (tokens.end[i] ?? 0) <= at; i++) {
    if (tokens.kind[i] !== Kind.Comment) inside.push(i);
  }
  const last = inside[inside.length - 1];
  if (last !== undefined && tokens.kind[last] === T.Colon) {
    const keyAt = inside[inside.length - 2];
    if (keyAt === undefined) return;
    const key = nameText(doc.text, tokens, keyAt);
    for (const k of METADATA_KEYS) {
      if (k.key !== key || !fits(k)) continue;
      for (const [value, meaning] of k.values) {
        items.add(value, 'value', { detail: meaning, documentation: k.doc });
      }
    }
    return;
  }
  if (!expected.has(T.Identifier)) return;
  const taken = new Set<string>();
  inside.forEach((j, n) => {
    const next = inside[n + 1];
    if (next !== undefined && tokens.kind[next] === T.Colon)
      taken.add(nameText(doc.text, tokens, j));
  });
  for (const k of METADATA_KEYS) {
    if (!fits(k) || taken.has(k.key)) continue;
    const kinds = k.kinds.map((x) => KIND_NAMES[x]).join(', ');
    items.add(k.key, 'property', { insertText: `${k.key}: `, detail: kinds, documentation: k.doc });
  }
}

/** Where in its statement an expected id is. */
type IdPlace = 'elements' | 'stylables' | 'classes' | 'none';

function idPlace(tokens: TokenStream, line: readonly number[]): IdPlace {
  const kinds = line.map((i) => tokens.kind[i]!);
  const prev = kinds[kinds.length - 1];
  if (prev === undefined) return 'none';
  // `:::a,b`: class names to the `:::`.
  for (let n = kinds.length - 1; n >= 0; n--) {
    const k = kinds[n];
    if (k === T.ClassSeparator) return 'classes';
    if (k !== T.Identifier && k !== T.Comma) break;
  }
  if (ARROW_SET[prev] === 1 || prev === T.Include || prev === T.Extend) return 'elements';
  const head = kinds[0];
  if (head === T.Note) return prev === T.For ? 'elements' : 'none';
  if (head === T.Class || head === T.Style) {
    // The targets, then (for `class`) a blank and the class names.
    let group = 0;
    let afterId = false;
    for (const k of kinds.slice(1)) {
      if (k === T.Identifier) {
        if (afterId) group = 1;
        afterId = true;
      } else if (k === T.Comma) afterId = false;
      else return 'none';
    }
    if (afterId) group = 1;
    if (group === 0) return 'stylables';
    return head === T.Class ? 'classes' : 'none';
  }
  return 'none';
}

/** The declared ids for `place`, leaving out the word being typed (`except`). */
function ids(items: Items, doc: DocumentView<UsecaseDocument>, place: IdPlace, except: number) {
  const model = doc.result.model as UsecaseModel;
  if (place === 'classes') {
    for (const c of model.classDefs) if (c.id !== 'default') items.add(c.id, 'class');
    return;
  }
  // Names mentioned somewhere other than the word.
  const named = new Set<string>();
  for (const s of doc.result.symbols) if (s.range.start !== except) named.add(s.name);
  for (const d of declaredOf(model)) {
    if (!named.has(d.name) || isKeyword(d.id) || generatedId(d.id) !== d.id) continue;
    if (place === 'elements' && d.kind !== 'actor' && d.kind !== 'usecase') continue;
    const what = KIND_NAMES[d.kind];
    items.add(d.id, d.kind === 'boundary' ? 'subgraph' : 'node', {
      detail: d.label === undefined ? what : `${what} · ${d.label}`,
    });
  }
}

/** The statement keywords the parser expects. */
function keywords(items: Items, expected: ReadonlySet<number>): void {
  for (const k of KEYWORD_ITEMS) {
    if (!expected.has(k.kind)) continue;
    items.keyword(k, usecaseDocs[k.kind]);
  }
}

/**
 * Directions after `direction`, `for` after `note`, `include` and `extend` after `..> :`, and
 * the arrow forms the parser expects where an arrow goes (a label and a style take keywords and
 * dashes as text, so those are offered only after their own tokens).
 */
function parts(items: Items, expected: ReadonlySet<number>, tokens: TokenStream, line: number[]) {
  const kinds = line.map((i) => tokens.kind[i]!);
  const prev = kinds[kinds.length - 1];
  if (prev === T.Direction) {
    for (const [dir, kind, meaning] of DIRECTIONS) {
      if (expected.has(kind)) items.add(dir, 'constant', { detail: meaning });
    }
  }
  if (prev === T.Note && expected.has(T.For)) {
    items.add('for', 'keyword', { documentation: usecaseDocs[T.For] ?? '' });
  }
  if (prev === T.Colon && kinds[kinds.length - 2] === T.DependencyArrow) {
    items.add('include', 'keyword', { documentation: usecaseDocs[T.Include] ?? '' });
    items.add('extend', 'keyword', { documentation: usecaseDocs[T.Extend] ?? '' });
  }
  if (!expected.has(T.ForwardSolid)) return;
  for (const [text, kind, meaning] of ARROW_FORMS) {
    if (!expected.has(kind)) continue;
    const documentation = usecaseDocs[kind];
    items.add(text, 'operator', {
      detail: meaning,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

export function usecaseCompletions(
  probe: ProbeResult,
  doc: DocumentView<UsecaseDocument>
): CompletionItem[] {
  if (probe.mode !== 'default') return [];
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const expected = new Set(probe.expected);
  const range = wordRange(text, tokens, probe, /[^\w-]/, (k) => WORDS.has(k));
  const items = new Items(text.slice(range.start, probe.offset), range);
  const m = openMetadata(tokens, range.start);
  if (m >= 0) {
    metadata(items, doc, tokens, m, range.start, expected);
    return items.list;
  }
  if (atLineStart(text, range.start)) {
    keywords(items, expected);
    if (items.list.length > 0) return items.list;
  }
  const line = lineBefore(tokens, range.start);
  if (expected.has(T.Identifier)) {
    const place = idPlace(tokens, line);
    if (place !== 'none') ids(items, doc, place, range.start);
  }
  parts(items, expected, tokens, line);
  return items.list;
}
