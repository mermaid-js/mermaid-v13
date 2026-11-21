/**
 * Block completion (DESIGN §4.5, D95, R-LANG-7, spec #521 "Language facet"): the probe's
 * expected kinds and lexer mode, and the line around the cursor, mapped to items.
 *
 * - `block` and `block-beta` where the parser expects the header.
 * - Where a statement may start: `columns`, `space`, `block:`, `block`, `classDef`, `class`,
 *   `style`, `end` inside a composite that holds a statement, and the block ids the diagram
 *   uses; after `columns `, `auto`.
 * - Right after a complete block on its line, nothing typed: the link kinds, its shapes when it
 *   has none, `space` and the used ids (`a b c` and `a space b` are rows of blocks). A link half
 *   typed (`a -`, `a ==`, `a <`): every link that lexes from there. After a labelled edge's
 *   text: its closing links. After a link: the block ids.
 * - At the end of an id, declared there or not: its shapes, the id as the label. After `block:`
 *   only those (an existing id there would open the composite a second time).
 * - Inside a block arrow's `(…)`: the directions.
 * - After `class` and `style`: the block ids (those `class` and `style` can name); after the ids
 *   of `class`: the class names used elsewhere, in source order.
 *
 * Nothing in a label, a shape, a `classDef` or `style` definition, a comment, a directive or
 * front matter.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { blockDocs } from '../generated/docs.ts';
import type { BlockModel } from '../model.ts';
import type { BlockDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { DIRECTIONS, LINKS, SHAPES } from './tables.ts';
import { LINE_BREAK, lineBefore, runAround, span, tokenAt } from './text.ts';
import { CompletionList, tokenBefore as lastToken } from '@mermaid-js/shared/parser/facet';

const BLANK = /^[\t ]*$/;
/** An id character (the id rule's class). */
const ID_CHAR = /[^([\-){}\s<>:=]/u;
const WORD_CHAR = /\w/;
const LETTER = /[a-z]/i;
/** A link's characters, as it is being typed (`x` and `o` heads are id characters before it). */
const LINK_CHAR = /[-=.<>xo]/;
/** `columns ` and what is typed of its count: a bare `columns` lexes as an id. */
const COLUMNS_ARG = /(?:^|[\t ])columns[\t ]+([a-z]*)$/;

/** The statement keywords, in the order completion offers them. */
const KEYWORDS: readonly (readonly [label: string, insert: string, kind: number])[] = [
  ['columns', 'columns ', T.Columns],
  ['space', 'space', T.SpaceBlock],
  ['block:', 'block:', T.IdBlock],
  ['block', 'block', T.Block],
  ['classDef', 'classDef ', T.ClassDef],
  ['class', 'class ', T.Class],
  ['style', 'style ', T.Style],
];

/** Words a keyword rule takes before the id rule somewhere: never offered as a block id. */
const KEYWORD_WORDS = new Set([
  'block',
  'block-beta',
  'columns',
  'space',
  'end',
  'default',
  'linkStyle',
  'interpolate',
  'classDef',
  'class',
  'style',
  'accTitle',
  'accDescr',
]);

/** The kinds a complete block ends with (the parser is in a chain after it). */
const AFTER_BLOCK = new Set<number>([T.NodeId, T.NodeDEnd, T.BlockArrowEnd, T.Size]);

/** The token of `kinds` that holds `at` (starts before it, ends at or after it), or -1. */
function tokenOf(tokens: TokenStream, at: number, kinds: readonly number[]): number {
  let j = lastToken(tokens, at - 1);
  while (j >= 0 && tokens.start[j] === tokens.end[j]) j--;
  if (j < 0 || at > (tokens.end[j] ?? 0)) return -1;
  return kinds.includes(tokens.kind[j] ?? Kind.EOF) ? j : -1;
}

/** The last significant, non-empty token that ends at or before `at`, or -1. */
function tokenBefore(tokens: TokenStream, at: number): number {
  for (let j = lastToken(tokens, at, 'end'); j >= 0; j--) {
    const k = tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.Comment || k === Kind.Directive || k === Kind.Space) continue;
    if ((tokens.end[j] ?? 0) > (tokens.start[j] ?? 0)) return j;
  }
  return -1;
}

/**
 * The block ids of `doc`, first use first, with their labels when they differ, but not one
 * whose only occurrence is `skip` (the word being typed), and only `\w+` ones when `words`.
 */
function blockIds(
  items: CompletionList,
  doc: DocumentView<BlockDocument>,
  skip: Range,
  words = false
): void {
  const labels = new Map<string, string>();
  const walk = (blocks: BlockModel['blocks']) => {
    for (const b of blocks) {
      if (!labels.has(b.id)) labels.set(b.id, b.label);
      walk(b.children);
    }
  };
  walk((doc.result.model as BlockModel).blocks);
  for (const s of doc.result.symbols) {
    if (s.kind !== 'block') continue;
    if (skip.start <= s.range.start && s.range.end <= skip.end) continue;
    if (words && !/^\w+$/.test(s.name)) continue;
    const label = labels.get(s.name);
    const shown = label === undefined || label === '' || label === s.name;
    items.add(s.name, 'node', shown ? {} : { detail: label });
  }
}

/**
 * The links a half-typed one starts (`-`, `==`, `<`), right after a block on its line; in an
 * edge's label (`closing`), only those that close it (no `<` head).
 */
function linkRest(text: string, at: number, closing: boolean): CompletionItem[] | undefined {
  const before = lineBefore(text, at, true);
  let k = before.length;
  while (k > 0 && LINK_CHAR.test(before.charAt(k - 1))) k--;
  // `x` and `o` before the link are part of the id, unless a blank comes before them.
  while (
    k < before.length &&
    /[xo]/.test(before.charAt(k)) &&
    k > 0 &&
    ID_CHAR.test(before.charAt(k - 1))
  )
    k++;
  const typed = before.slice(k);
  if (!/^(?:<|[xo<]?[-=])/.test(typed) || BLANK.test(before.slice(0, k))) return undefined;
  let end = at;
  while (end < text.length && /[-=.>xo]/.test(text.charAt(end))) end++;
  return linkItems(new CompletionList(typed, span(at - typed.length, end)), closing);
}

function linkItems(items: CompletionList, closing: boolean): CompletionItem[] {
  for (const [link, detail] of LINKS) {
    if (closing && link.startsWith('<')) continue;
    items.keyword({ label: link, detail }, blockDocs[T.Link], 'operator');
  }
  return items.list;
}

/** A block arrow's directions, for the word at `at` in its `(…)`. */
function directionItems(text: string, at: number): CompletionItem[] {
  const word = runAround(text, at, LETTER);
  const items = new CompletionList(text.slice(word.start, at), word);
  for (const [dir, detail] of DIRECTIONS)
    items.keyword({ label: dir, detail }, blockDocs[T.Dir], 'constant');
  return items.list;
}

/** The ids `class` and `style` name, for the `\w` run at `at` in their id list. */
function targetItems(doc: DocumentView<BlockDocument>, at: number): CompletionItem[] {
  const word = runAround(doc.text, at, WORD_CHAR);
  const items = new CompletionList(doc.text.slice(word.start, at), word);
  blockIds(items, doc, word, true);
  return items.list;
}

/**
 * The class names the diagram uses (`classDef` and the other `class` statements), for the word
 * at `at` in a `class` statement's class text.
 */
function classItems(doc: DocumentView<BlockDocument>, token: Range, at: number): CompletionItem[] {
  const word = runAround(doc.text, at, /\S/, token.start, token.end);
  const items = new CompletionList(doc.text.slice(word.start, at), word);
  for (const s of doc.result.symbols) {
    if (s.kind !== 'class') continue;
    if (token.start <= s.range.start && s.range.end <= token.end) continue;
    items.add(s.name, 'class');
  }
  return items.list;
}

/**
 * What the `class` or `style` statement at `at` is being written into: its ids, its class
 * text, or neither. Its id list is one token (`a, b`); a `,` after it with nothing after the
 * comma yet is lexed as the rest of the line, but is still the list.
 */
function inClassOrStyle(
  doc: DocumentView<BlockDocument>,
  tokens: TokenStream,
  probe: ProbeResult
): CompletionItem[] | undefined {
  const at = probe.offset;
  const ids =
    probe.expected.includes(T.ClassEntityIds) || probe.expected.includes(T.StyleEntityIds);
  if (ids || probe.mode === 'CLASS' || probe.mode === 'STYLE_STMNT') return targetItems(doc, at);
  if (tokenOf(tokens, at, [T.ClassEntityIds, T.StyleEntityIds]) >= 0) return targetItems(doc, at);
  const j = tokenOf(tokens, at, [T.StyleClass, T.StyleDefinitionData]);
  const empty =
    probe.expected.includes(T.StyleClass) || probe.expected.includes(T.StyleDefinitionData);
  if (j < 0 && !empty) return undefined;
  const range = j < 0 ? span(at, at) : span(tokens.start[j] ?? 0, tokens.end[j] ?? 0);
  if (/^[\t ]*,[\t ]*\w*$/.test(doc.text.slice(range.start, at))) return targetItems(doc, at);
  const kind = j < 0 ? undefined : tokens.kind[j];
  if (kind === T.StyleDefinitionData || probe.expected.includes(T.StyleDefinitionData)) return [];
  return classItems(doc, range, at);
}

/** The shapes of the block `id`, the id as the label (`a["a"]`, `a{"a"}`, …). */
function shapes(items: CompletionList, id: string, prefix: string): void {
  for (const [open, close, type] of SHAPES)
    items.add(`${prefix}${open}"${id}"${close}`, 'shape', { detail: type });
}

/**
 * The id at `word` if completion may offer its shapes: it ends at the cursor, lexes as one id
 * that is no keyword, holds no quote and has no shape after it yet.
 */
function shapeable(doc: DocumentView<BlockDocument>, tokens: TokenStream, word: Range) {
  const id = doc.text.slice(word.start, word.end);
  if (id === '' || id.includes('"') || KEYWORD_WORDS.has(id)) return undefined;
  const j = tokenAt(tokens, word.start);
  if (j < 0 || tokens.kind[j] !== T.NodeId || tokens.end[j] !== word.end) return undefined;
  const next = tokens.kind[j + 1];
  return next === T.NodeDStart || next === T.BlockArrowStart ? undefined : id;
}

export function blockCompletions(
  probe: ProbeResult,
  doc: DocumentView<BlockDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const { mode, offset } = probe;
  if (mode === 'ARROW_DIR') return directionItems(text, offset);
  if (mode === 'INITIAL' || mode === 'LLABEL') {
    const rest = linkRest(text, offset, mode === 'LLABEL');
    if (rest) return rest;
  }
  const statement = inClassOrStyle(doc, tokens, probe);
  if (statement) return statement;
  const typed = text.slice(probe.prefix.start, offset);
  // After a labelled edge's text: what closes it.
  if (mode === 'LLABEL' && typed === '' && probe.expected.includes(T.Link))
    return linkItems(new CompletionList('', span(offset, offset)), true);
  if (mode !== 'INITIAL' || LINE_BREAK.test(typed)) return [];
  const count = COLUMNS_ARG.exec(lineBefore(text, offset, true));
  if (count) {
    const at = offset - (count[1] ?? '').length;
    const items = new CompletionList(count[1] ?? '', span(at, runAround(text, offset, LETTER).end));
    items.keyword({ label: 'auto' }, blockDocs[T.Columns], 'constant');
    return items.list;
  }
  const expected = new Set(probe.expected);
  if (expected.has(T.Block) && !result.statements.some((s) => s.kind === 'header')) {
    const items = new CompletionList(typed, runAround(text, offset, /[\w-]/, probe.prefix.start));
    for (const header of ['block', 'block-beta'])
      items.keyword({ label: header }, blockDocs[T.Block]);
    return items.list;
  }
  return expected.has(T.NodeId) ? codeItems(probe, doc, tokens, expected) : [];
}

/** Where a block or a statement may go: links, keywords, ids and shapes. */
function codeItems(
  probe: ProbeResult,
  doc: DocumentView<BlockDocument>,
  tokens: TokenStream,
  expected: ReadonlySet<number>
): CompletionItem[] {
  const { text } = doc;
  const { offset } = probe;
  const start = probe.prefix.start;
  const typed = text.slice(start, offset);
  const prev = tokenBefore(tokens, start);
  const prevKind = prev < 0 ? Kind.EOF : (tokens.kind[prev] ?? Kind.EOF);
  const word = runAround(text, offset, ID_CHAR, start);
  const items = new CompletionList(typed, word);
  const id = shapeable(doc, tokens, word);
  // `block:` takes a new id: its shapes only.
  if (prevKind === T.IdBlock) {
    if (id !== undefined) shapes(items, id, id);
    return items.list;
  }
  const lineStart = BLANK.test(lineBefore(text, start, true));
  if (typed === '' && !lineStart && AFTER_BLOCK.has(prevKind) && expected.has(T.Link)) {
    // A complete block: what links it on, its shape, and the blocks of its row.
    linkItems(items, false);
    const before = text.slice(tokens.start[prev] ?? 0, tokens.end[prev] ?? 0);
    if (prevKind === T.NodeId && expected.has(T.NodeDStart) && !KEYWORD_WORDS.has(before))
      shapes(items, before, '');
    items.keyword({ label: 'space' }, blockDocs[T.SpaceBlock]);
    blockIds(items, doc, word);
    return items.list;
  }
  if (expected.has(T.Columns)) {
    for (const [label, insert, kind] of KEYWORDS) items.keyword({ label, insert }, blockDocs[kind]);
    if (expected.has(T.End)) items.keyword({ label: 'end' }, blockDocs[T.End]);
  }
  blockIds(items, doc, word);
  if (id !== undefined) shapes(items, id, id);
  return items.list;
}
