/**
 * Flowchart completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only when the parser tests their kind at the cursor;
 * the token before the cursor tells id kinds apart (a node after a link, a class after `:::`).
 *
 * Probe edges handled here (tickets/27.md): `flowchart |` at the end of the text probes as a
 * statement start (v12 lexes the blank as the header's line end), so the header line is
 * checked by position; `A --|` probes as edge text (mode `edgeText`), so the rest of the arrow
 * is offered from the link start token; shape data is one token, so the replacement range is
 * worked out from its text; label and string modes get nothing.
 *
 * And from #179: inside edge text the closing arrow is offered by how the link opened (the
 * probe may be in edge-text mode or past an unclosed `--`); an arrow glued to an id (`A-`,
 * `B <-`) lexes as part of the id or a tag, so it is found from the text.
 */
import { inKindSet, Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { flowchartCategories } from '../generated/categories.ts';
import { flowchartDocs } from '../generated/docs.ts';
import type { FlowDocument } from '../parser/ast.ts';
import type { FlowModel } from '../parser/model.ts';
import { destructLink } from '../parser/model.ts';
import { READ_PAST } from '../parser/parser.ts';
import { acceptedShape, SHAPE_GROUPS } from '../parser/shapes.ts';
import { T } from '../parser/tokens.ts';
import {
  ARROWS,
  BRACKET_SHAPES,
  CLOSERS,
  CURVES,
  DIRECTIONS,
  describeLink,
  EDGE_DATA,
  KEYWORDS,
  LINK_TARGETS,
  NODE_DATA_KEYS,
  span,
  tokenBefore,
} from './tables.ts';

/** Modes in which a statement, a header or a `click` target is being written. */
const CODE_MODES = new Set(['INITIAL', 'dir', 'click']);
const EDGE_TEXT_MODES = new Set(['edgeText', 'thickEdgeText', 'dottedEdgeText']);
/** Kinds that make up an id word (the rest of the word after the cursor is replaced too). */
const ID_PART = new Set<number>([T.NodeString, T.UnicodeText, T.Num, T.Minus, T.Down, T.Click]);
/** Ids, keywords and directions: a cursor inside one replaces all of it. */
const isWord = (kind: number) =>
  ID_PART.has(kind) || ['Keyword', 'Constant'].includes(flowchartCategories[kind]!);
const BLANK = new Set<number>([T.Space, Kind.Space]);
/** Where a statement ends; `end` closes a block and takes the line break after it. */
const STATEMENT_END = new Set<number>([Kind.Newline, T.Semi, T.Eof, Kind.EOF, T.End]);

/** Items filtered by the typed prefix, one per label. */
class Items {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  constructor(
    private readonly prefix: string,
    private readonly range: Range
  ) {}

  add(label: string, kind: CompletionKind, extra: Partial<CompletionItem> = {}): void {
    if (!label.startsWith(this.prefix) || this.seen.has(label)) return;
    this.seen.add(label);
    this.list.push({ label, kind, insertText: label, range: this.range, ...extra });
  }
}

/** The statement the cursor is in, up to the word being typed. */
interface Statement {
  /** Kind of its first significant token, or -1 at a statement start. */
  head: number;
  /** Kind of the last significant token before the word, or -1. */
  prev: number;
  /** Blank-separated groups after the head (`class A |` has one). */
  groups: number;
}

function statementBefore(tokens: TokenStream, at: number): Statement {
  const kinds: number[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.end[i] ?? 0) > at) continue;
    if (STATEMENT_END.has(k)) break;
    // As the parser reads it: `click` heads no statement, the node id after it does.
    if (inKindSet(READ_PAST, k)) continue;
    kinds.push(k);
  }
  kinds.reverse();
  const first = kinds.findIndex((k) => !BLANK.has(k));
  let groups = 0;
  for (let i = first + 1; first >= 0 && i < kinds.length; i++) {
    if (!BLANK.has(kinds[i]!) && BLANK.has(kinds[i - 1]!)) groups++;
  }
  let prev = -1;
  for (let i = kinds.length - 1; i >= 0 && prev < 0; i--)
    if (!BLANK.has(kinds[i]!)) prev = kinds[i]!;
  return { head: first < 0 ? -1 : kinds[first]!, prev, groups };
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  let i = tokenBefore(tokens, o);
  if (i >= 0 && (tokens.end[i] ?? 0) <= o) i++;
  while (
    i < tokens.length &&
    (tokens.start[i] ?? 0) <= end &&
    (tokens.end[i] ?? 0) > end &&
    isWord(tokens.kind[i]!) &&
    !/\s/.test(text.charAt(end))
  ) {
    end = tokens.end[i] ?? end;
    i++;
  }
  // Some tokens take the blanks after them (`end\n  `): the word stops at the first blank
  // after the cursor, so a range never runs on to the next line or statement.
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** Whether `[from, to)` is blanks on the header line, right after the header keyword. */
function onHeaderLine(text: string, tokens: TokenStream, from: number): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const k = tokens.kind[i]!;
    if (k === T.Graph) {
      const end = tokens.end[i] ?? 0;
      return end <= from && /^[^\S\r\n\u2028\u2029]*$/.test(text.slice(end, from));
    }
    if (!(BLANK.has(k) || k === Kind.Newline || k === Kind.Comment || k === Kind.Directive)) {
      return false;
    }
  }
  return false;
}

/** Ids of `kinds` in first-mention order, leaving out the word being typed. */
function ids(
  items: Items,
  symbols: readonly SymbolOccurrence[],
  kinds: ReadonlySet<string>,
  except: number,
  kindOf: (s: SymbolOccurrence) => CompletionKind,
  detailOf?: (name: string) => string | undefined
): void {
  for (const s of symbols) {
    if (!kinds.has(s.kind) || s.range.start === except || s.name === '') continue;
    const detail = detailOf?.(s.name);
    items.add(s.name, kindOf(s), detail === undefined ? {} : { detail });
  }
}

const NODE_KINDS = new Set(['node', 'subgraph']);
const CLASS_KINDS = new Set(['class']);

type IdContext = 'nodes' | 'classes' | 'none';

/** What an expected id is at this point of the statement. */
function idContext(st: Statement): IdContext {
  if (st.prev === T.StyleSeparator) return 'classes';
  switch (st.head) {
    case T.Class:
      return st.groups === 0 ? 'nodes' : 'classes';
    case T.ClassDef:
      return st.groups === 0 ? 'classes' : 'none';
    case T.Style:
      return st.groups === 0 ? 'nodes' : 'none';
    case T.Subgraph:
    case T.LinkStyle:
    case T.Click:
      return 'none';
    default:
      return 'nodes';
  }
}

function arrowItem(items: Items, arrow: string, extra: Partial<CompletionItem> = {}): void {
  const { type, stroke, length } = destructLink(arrow);
  items.add(arrow, 'operator', {
    detail: describeLink(type, stroke, length),
    documentation: flowchartDocs[T.Link],
    ...extra,
  });
}

/** `A --|`: the rest of the arrow after a link start, replacing what was typed of it. */
function arrowRest(text: string, tokens: TokenStream, o: number): CompletionItem[] {
  // The link start token takes the blanks after it, line breaks included: only what is typed
  // up to the cursor counts, and only when the cursor is right after it.
  const i = tokenBefore(tokens, o - 1);
  if (i < 0 || tokens.kind[i] !== T.StartLink || (tokens.end[i] ?? 0) < o) return [];
  const typed = text.slice(tokens.start[i], o).trimStart();
  if (typed === '' || typed !== typed.trimEnd()) return [];
  const range = span(o - typed.length, o);
  const items = new Items(typed, range);
  for (const a of ARROWS) if (a !== typed) arrowItem(items, a);
  return items.list;
}

/** Start of the run of arrow characters (`-`, `=`, `.`) that ends at `o`. */
function arrowRunStart(text: string, o: number): number {
  let j = o;
  while (j > 0 && '-=.'.includes(text.charAt(j - 1))) j--;
  return j;
}

/**
 * `A -- text --|`, `A -. text .|`, `A -- text |`: the arrow that closes edge text, by how the
 * link was opened. Offered after a blank or a typed part of the closer, once some edge text
 * is written; undefined when the cursor is not in edge text.
 */
function edgeTextClose(text: string, tokens: TokenStream, o: number): CompletionItem[] | undefined {
  let open = -1;
  for (let i = tokenBefore(tokens, o - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if (k === T.StartLink) {
      open = i;
      break;
    }
    if (k === T.Link || STATEMENT_END.has(k)) return undefined;
  }
  if (open < 0) return undefined;
  const opened = text.slice(tokens.start[open], tokens.end[open]).trim();
  const closers = CLOSERS[opened.slice(-2)];
  const j = arrowRunStart(text, o);
  const textFrom = tokens.end[open] ?? 0;
  if (!closers || j <= textFrom || text.slice(textFrom, j).trim() === '') return undefined;
  if (j === o && !/\s/.test(text.charAt(o - 1))) return [];
  const typed = text.slice(j, o);
  const items = new Items(typed, span(j, o));
  for (const c of closers) {
    if (c === typed) continue;
    const { type, stroke, length } = destructLink(c, opened);
    items.add(c, 'operator', {
      detail: describeLink(type, stroke, length),
      documentation: flowchartDocs[T.Link],
    });
  }
  return items.list;
}

/** `A-|`, `B <-|`: the arrows that start with what is typed right after an id. */
function gluedArrow(text: string, o: number): CompletionItem[] {
  let j = arrowRunStart(text, o);
  if (text.charAt(j - 1) === '<') j--;
  if (j === o) return [];
  // Something on the line before it: the arrow's start node.
  let k = j;
  while (k > 0 && /[^\S\r\n]/.test(text.charAt(k - 1))) k--;
  if (k === 0 || /[\r\n;]/.test(text.charAt(k - 1))) return [];
  const typed = text.slice(j, o);
  const items = new Items(typed, span(j, o));
  for (const a of ARROWS) if (a !== typed) arrowItem(items, a);
  return items.list;
}

/**
 * Where the `@{ … }` around `o` opens (the end of its `@{`), and whether the id before it is
 * an edge id (`e1@{ … }` after `A e1@--> B`); undefined when no `@{` token is found.
 */
function dataBlock(
  text: string,
  tokens: TokenStream,
  model: FlowModel,
  o: number
): { from: number; to: number; edge: boolean } | undefined {
  for (let i = tokenBefore(tokens, o - 1); i >= 0 && tokens.kind[i] === T.ShapeData; i--) {
    const start = tokens.start[i] ?? 0;
    if (!text.startsWith('@{', start)) continue;
    const id = tokenBefore(tokens, start - 1);
    const name = id >= 0 && tokens.end[id] === start ? text.slice(tokens.start[id], start) : '';
    let last = i;
    while (tokens.kind[last + 1] === T.ShapeData) last++;
    return {
      from: start + 2,
      to: tokens.end[last] ?? o,
      edge: name !== '' && model.edges.some((e) => e.id === name),
    };
  }
  return undefined;
}

/** Keys already written in `text[from, to)`, but for the one at `except`. */
function writtenKeys(text: string, from: number, to: number, except: number): Set<string> {
  const keys = new Set<string>();
  const re = /(^|[\s,{])([A-Za-z]+)[^\S\r\n]*:/g;
  const block = text.slice(from, to);
  for (let m = re.exec(block); m; m = re.exec(block)) {
    if (from + m.index + m[1]!.length !== except) keys.add(m[2]!);
  }
  return keys;
}

/** Every shape name a node's `shape:` accepts, its group's first name as the detail. */
function shapeNames(items: Items): void {
  for (const group of SHAPE_GROUPS) {
    for (const shape of group.filter(acceptedShape)) {
      items.add(shape, 'shape', { detail: shape === group[0] ? 'shape' : `same as ${group[0]}` });
    }
  }
}

/**
 * Inside `@{ … }`: keys at a key position, then the values of a key that takes known ones:
 * shape names after a node's `shape:`, an edge's `animate`, `animation` and `curve` values.
 */
function shapeData(
  text: string,
  tokens: TokenStream,
  model: FlowModel,
  probe: ProbeResult
): CompletionItem[] {
  // Scanned back from the cursor by hand: a regex anchored at the end retries every blank of
  // a long run (pitfall 5).
  const o = probe.offset;
  const block = dataBlock(text, tokens, model, o);
  const from = block?.from ?? probe.prefix.start;
  const edge = block?.edge ?? false;
  const isSpace = (i: number) => /\s/.test(text.charAt(i));
  const back = (at: number, test: (j: number) => boolean) => {
    let i = at;
    while (i > from && test(i - 1)) i--;
    return i;
  };
  const rest = /^[\w-]*/.exec(text.slice(o, o + 64))?.[0].length ?? 0;
  // `key: va|`
  const name = back(o, (j) => /[\w-]/.test(text.charAt(j)));
  let k = back(name, isSpace);
  if (k > from && text.charAt(k - 1) === ':') {
    k = back(k - 1, isSpace);
    const at = back(k, (j) => /[A-Za-z]/.test(text.charAt(j)));
    if (at < k && (at === from || /[\s,{]/.test(text.charAt(at - 1)))) {
      const key = text.slice(at, k);
      const items = new Items(text.slice(name, o), span(name, o + rest));
      if (edge) for (const value of EDGE_DATA[key] ?? []) items.add(value, 'constant');
      else if (key === 'shape') shapeNames(items);
      return items.list;
    }
  }
  // A key: letters after the start, a `,`, a `{` or a line break (blanks between).
  const key = back(o, (j) => /[A-Za-z]/.test(text.charAt(j)));
  const blanks = back(key, isSpace);
  const atKey =
    blanks === from ||
    /[,{]/.test(text.charAt(blanks - 1)) ||
    /[\r\n]/.test(text.slice(blanks, key));
  if (!atKey) return [];
  const typed = text.slice(key, o);
  const items = new Items(typed, span(key, o + rest));
  // A key written twice is a YAML error: only the ones not in the block yet.
  const written = block ? writtenKeys(text, from, block.to, key) : new Set<string>();
  for (const k2 of edge ? Object.keys(EDGE_DATA) : NODE_DATA_KEYS) {
    if (!written.has(k2)) items.add(k2, 'property', { insertText: `${k2}: ` });
  }
  return items.list;
}

/** Keywords, link targets and operators whose kind the parser tests at the cursor. */
function byKind(items: Items, expected: ReadonlySet<number>): void {
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    const documentation = flowchartDocs[k.kind];
    items.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  if (expected.has(T.LinkTarget)) for (const t of LINK_TARGETS) items.add(t, 'constant');
}

function operators(items: Items, expected: ReadonlySet<number>): void {
  if (expected.has(T.Link) || expected.has(T.StartLink)) {
    for (const a of ARROWS) arrowItem(items, a);
  }
  if (expected.has(T.Amp)) {
    items.add('&', 'operator', { documentation: flowchartDocs[T.Amp] ?? '' });
  }
  if (expected.has(T.StyleSeparator)) {
    items.add(':::', 'operator', { documentation: flowchartDocs[T.StyleSeparator] ?? '' });
  }
}

/** Whether `range` is non-empty and lexes as id parts only (not `end`, `style`, …). */
function isId(tokens: TokenStream, range: Range): boolean {
  if (range.start === range.end) return false;
  for (let i = Math.max(0, tokenBefore(tokens, range.start)); i < tokens.length; i++) {
    const start = tokens.start[i] ?? 0;
    if (start >= range.end) break;
    if ((tokens.end[i] ?? 0) <= range.start) continue;
    if (!ID_PART.has(tokens.kind[i]!)) return false;
  }
  return true;
}

/** `direction ` written as a whole line so far: a subgraph direction is being typed. */
function afterDirection(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[^\S\r\n]*direction[^\S\r\n]+$/.test(text.slice(lineStart, at));
}

/** Node and subgraph ids, then the word's bracket shapes when it is a node in a chain. */
function nodes(
  items: Items,
  result: DocumentView<FlowDocument>['result'],
  st: Statement,
  word: string,
  typedAt: number,
  nodeKind: (s: SymbolOccurrence) => CompletionKind
): void {
  const model = result.model as FlowModel;
  const labels = new Map(model.vertices.map((v) => [v.id, v.text]));
  ids(items, result.symbols, NODE_KINDS, typedAt, nodeKind, (name) => {
    const label = labels.get(name);
    return label === undefined || label === name ? undefined : label;
  });
  // Right after an id in a chain (after a link or `&`, or an id used elsewhere): its bracket
  // shapes, with the id as the label. `word` is empty when it lexes as a keyword (`end`).
  if (st.head === T.Class || st.head === T.Style || word === '') return;
  const linked = st.prev === T.Link || st.prev === T.Amp || st.prev === T.Pipe;
  const known =
    linked ||
    result.symbols.some(
      (s) => NODE_KINDS.has(s.kind) && s.name === word && s.range.start !== typedAt
    );
  if (!known) return;
  for (const [open, close, name] of BRACKET_SHAPES) {
    items.add(`${word}${open}${word}${close}`, 'shape', { detail: name });
  }
}

export function flowchartCompletions(
  probe: ProbeResult,
  doc: DocumentView<FlowDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const model = result.model as FlowModel;
  if (probe.mode === 'shapeData') return shapeData(text, tokens, model, probe);
  const close = edgeTextClose(text, tokens, probe.offset);
  if (close) return close;
  // Right after `--`, `==` or `-.`: the rest of the arrow, whichever mode the probe ended in
  // (the link start token takes the line break after it, so the probe may be past it).
  const rest = arrowRest(text, tokens, probe.offset);
  if (rest.length > 0 || EDGE_TEXT_MODES.has(probe.mode)) return rest;
  if (!CODE_MODES.has(probe.mode)) return [];

  const word = wordRange(text, tokens, probe);
  // `A,B` is one word to the lexer: only what follows the last comma is replaced.
  const comma = text.slice(word.start, probe.offset).lastIndexOf(',');
  const range = comma >= 0 ? span(word.start + comma + 1, word.end) : word;
  const items = new Items(text.slice(range.start, probe.offset), range);
  const expected = new Set(probe.expected);
  // The header's direction: by kind, or by position at the end of the text (see above).
  if (
    expected.has(T.Dir) ||
    onHeaderLine(text, tokens, range.start) ||
    afterDirection(text, range.start)
  ) {
    for (const [dir, meaning] of DIRECTIONS) items.add(dir, 'constant', { detail: meaning });
    return items.list;
  }
  const subgraphs = new Set(model.subgraphs.map((s) => s.id));
  const nodeKind = (s: SymbolOccurrence): CompletionKind =>
    subgraphs.has(s.name) ? 'subgraph' : 'node';
  if (probe.mode === 'click') {
    ids(items, result.symbols, NODE_KINDS, word.start, nodeKind);
    return items.list;
  }
  const st = statementBefore(tokens, word.start);
  if (st.prev === T.Interpolate) {
    for (const curve of CURVES) items.add(curve, 'constant');
    return items.list;
  }
  byKind(items, expected);
  const context = expected.has(T.NodeString) ? idContext(st) : 'none';
  if (context === 'classes') ids(items, result.symbols, CLASS_KINDS, word.start, () => 'class');
  else if (context === 'nodes') {
    const id = isId(tokens, range) ? text.slice(range.start, range.end) : '';
    nodes(items, result, st, id, word.start, nodeKind);
  }
  operators(items, expected);
  // An arrow glued to the id (`A-`, `B <-`): the lexer reads it as part of the id or a tag.
  if (!expected.has(T.Graph) && st.head !== T.Graph && idContext(st) === 'nodes') {
    for (const item of gluedArrow(text, probe.offset)) {
      if (!items.list.some((x) => x.label === item.label)) items.list.push(item);
    }
  }
  return items.list;
}
