/**
 * Block completion (DESIGN §4.5, D95, R-LANG-7, spec #521 "Language facet"): the probe's
 * expected kinds and lexer mode, and the line around the cursor, mapped to items.
 *
 * - `block` and `block-beta` where the parser expects the header.
 * - Where a statement may start: `columns`, `space`, `block:`, `block`, `classDef`, `class`,
 *   `style`, `end` inside a composite, and the block ids the diagram uses.
 * - Right after a block on its line, nothing typed: the link kinds; a link half typed
 *   (`a -`, `a ==`, `a <-`): the links it starts. After a link: the block ids.
 * - At the end of an id used elsewhere or written after a link: its shapes, the id as the label.
 * - Inside a block arrow's `(…)`: the directions.
 * - After `class` and `style`: the block ids (those `class` and `style` can name); after the ids
 *   of `class`: the class names used elsewhere, in source order.
 *
 * Nothing in a label, a shape, a `classDef` or `style` definition, a comment, a directive or
 * front matter. Line breaks mean nothing to block's grammar, so "on its line" is the editor's
 * reading: an author writes one statement a line.
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
import { blockDocs } from '../generated/docs.ts';
import type { BlockModel } from '../model.ts';
import type { BlockDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import { DIRECTIONS, LINE_BREAK, LINKS, lineBefore, runAround, SHAPES, span } from './tables.ts';

const BLANK = /^[\t ]*$/;
/** An id character (the id rule's class). */
const ID_CHAR = /[^([\-){}\s<>:=]/u;
const WORD_CHAR = /\w/;
const LETTER = /[a-z]/i;
/** A link's characters, as it is being typed (`x` and `o` heads are id characters before it). */
const LINK_CHAR = /[-=.<>xo]/;

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

/** The last token of `kinds` that holds `at` (starts before it, ends at or after it), or -1. */
function tokenAt(tokens: TokenStream, at: number, kinds: readonly number[]): number {
  let found = -1;
  for (let j = 0; j < tokens.length; j++) {
    if ((tokens.start[j] ?? 0) >= at) break;
    if (at <= (tokens.end[j] ?? 0) && kinds.includes(tokens.kind[j] ?? Kind.EOF)) found = j;
  }
  return found;
}

/** The last significant token that ends at or before `at`, or -1. */
function tokenBefore(tokens: TokenStream, at: number): number {
  let found = -1;
  for (let j = 0; j < tokens.length; j++) {
    if ((tokens.end[j] ?? 0) > at) break;
    const k = tokens.kind[j] ?? Kind.EOF;
    if (k === Kind.Comment || k === Kind.Directive || k === Kind.Space) continue;
    if ((tokens.end[j] ?? 0) > (tokens.start[j] ?? 0)) found = j;
  }
  return found;
}

/** Items for one range, kept in order with no label twice, filtered by what was typed. */
class Items {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly typed: string,
    private readonly range: Range
  ) {}

  add(
    label: string,
    kind: CompletionKind,
    extra: { insertText?: string; detail?: string; documentation?: string | undefined } = {}
  ): void {
    if (this.seen.has(label) || !label.startsWith(this.typed)) return;
    this.seen.add(label);
    const { insertText = label, detail, documentation } = extra;
    this.list.push({
      label,
      kind,
      insertText,
      range: this.range,
      ...(detail === undefined ? {} : { detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

/**
 * The block ids of `doc`, first use first, with their labels when they differ, but none whose
 * only occurrences are in `skip` (the one being typed), and only `\w+` ones when `words`.
 */
function blockIds(
  items: Items,
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

/** The links `typed` starts (`-`, `==`, `<-`), right after a block on its line. */
function linkRest(text: string, at: number): CompletionItem[] | undefined {
  const before = lineBefore(text, at);
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
  const items = new Items(typed, span(at - typed.length, end));
  for (const [link, detail] of LINKS) items.add(link, 'operator', { detail });
  return items.list;
}

/** A block arrow's directions, for the word at `at` in its `(…)`. */
function directionItems(text: string, at: number): CompletionItem[] {
  const word = runAround(text, at, LETTER);
  const items = new Items(text.slice(word.start, at), word);
  for (const [dir, detail] of DIRECTIONS)
    items.add(dir, 'constant', { detail, documentation: blockDocs[T.Dir] });
  return items.list;
}

/** The ids `class` and `style` name, for the `\w` run at `at` in their id list. */
function targetItems(doc: DocumentView<BlockDocument>, at: number): CompletionItem[] {
  const word = runAround(doc.text, at, WORD_CHAR);
  const items = new Items(doc.text.slice(word.start, at), word);
  blockIds(items, doc, word, true);
  return items.list;
}

/**
 * The class names the diagram uses (`classDef` and the other `class` statements), for the word
 * at `at` in a `class` statement's class text.
 */
function classItems(doc: DocumentView<BlockDocument>, token: Range, at: number): CompletionItem[] {
  const word = runAround(doc.text, at, /\S/, token.start, token.end);
  const items = new Items(doc.text.slice(word.start, at), word);
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
  if (tokenAt(tokens, at, [T.ClassEntityIds, T.StyleEntityIds]) >= 0) return targetItems(doc, at);
  const j = tokenAt(tokens, at, [T.StyleClass, T.StyleDefinitionData]);
  const empty =
    probe.expected.includes(T.StyleClass) || probe.expected.includes(T.StyleDefinitionData);
  if (j < 0 && !empty) return undefined;
  const range = j < 0 ? span(at, at) : span(tokens.start[j] ?? 0, tokens.end[j] ?? 0);
  if (/^[\t ]*,[\t ]*\w*$/.test(doc.text.slice(range.start, at))) return targetItems(doc, at);
  const kind = j < 0 ? undefined : tokens.kind[j];
  if (kind === T.StyleDefinitionData || probe.expected.includes(T.StyleDefinitionData)) return [];
  return classItems(doc, range, at);
}

/** Whether a block id was written right before `at` (the parser is in a chain after it). */
const AFTER_BLOCK = new Set<number>([T.NodeId, T.NodeDEnd, T.BlockArrowEnd, T.Size]);

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
    const rest = linkRest(text, offset);
    if (rest) return rest;
  }
  const statement = inClassOrStyle(doc, tokens, probe);
  if (statement) return statement;
  if (mode !== 'INITIAL') return [];
  const typed = text.slice(probe.prefix.start, offset);
  if (LINE_BREAK.test(typed)) return [];
  const expected = new Set(probe.expected);
  if (expected.has(T.Block) && !result.statements.some((s) => s.kind === 'header')) {
    const items = new Items(typed, runAround(text, offset, /[\w-]/, probe.prefix.start));
    for (const header of ['block', 'block-beta'])
      items.add(header, 'keyword', { documentation: blockDocs[T.Block] });
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
  const lineStart = BLANK.test(lineBefore(text, start));
  const prev = tokenBefore(tokens, start);
  const prevKind = prev < 0 ? Kind.EOF : (tokens.kind[prev] ?? Kind.EOF);
  // Right after a block on its line: what links it on.
  if (typed === '' && !lineStart && AFTER_BLOCK.has(prevKind) && expected.has(T.Link)) {
    const items = new Items('', span(offset, offset));
    for (const [link, detail] of LINKS)
      items.add(link, 'operator', { detail, documentation: blockDocs[T.Link] });
    return items.list;
  }
  const word = runAround(text, offset, ID_CHAR, start);
  const items = new Items(typed, word);
  if (expected.has(T.Columns)) {
    for (const [label, insertText, kind] of KEYWORDS)
      items.add(label, 'keyword', { insertText, documentation: blockDocs[kind] });
    if (expected.has(T.End)) items.add('end', 'keyword', { documentation: blockDocs[T.End] });
  }
  blockIds(items, doc, word);
  shapeItems(items, doc, tokens, word, prevKind);
  return items.list;
}

/**
 * At the end of an id with no shape after it, used elsewhere in the diagram or written after a
 * link: its shapes, with the id as the label.
 */
function shapeItems(
  items: Items,
  doc: DocumentView<BlockDocument>,
  tokens: TokenStream,
  word: Range,
  prevKind: number
): void {
  const { text, result } = doc;
  const id = text.slice(word.start, word.end);
  if (id === '' || id.includes('"')) return;
  const j = tokenAt(tokens, word.end, [T.NodeId]);
  if (j < 0 || tokens.start[j] !== word.start || tokens.end[j] !== word.end) return;
  if (tokens.kind[j + 1] === T.NodeDStart || tokens.kind[j + 1] === T.BlockArrowStart) return;
  const known =
    prevKind === T.Link ||
    result.symbols.some((s) => s.kind === 'block' && s.name === id && s.range.start !== word.start);
  if (!known) return;
  for (const [open, close, type] of SHAPES) {
    items.add(`${id}${open}"${id}"${close}`, 'shape', { detail: type });
  }
}
