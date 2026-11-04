/**
 * ER completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode mapped
 * to items. Keywords are offered only when the parser tests their kind at the cursor; the
 * statement before the cursor tells id kinds apart (an entity after a cardinality, a class
 * after `:::` or in `class A |`), and which end of a relationship a cardinality is for.
 *
 * Inside an attribute block (mode `block`) the items are the keys and the types the document
 * already uses; in values (`accTitle:`, `accDescr`, a backtick name) there are none. `direction`
 * with no direction yet lexes as an entity name, so the line's text decides that one.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { erCategories } from '../generated/categories.ts';
import { erDocs } from '../generated/docs.ts';
import type { ErDocument } from '../parser/ast.ts';
import type { ErModel } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import { writtenName } from './names.ts';
import {
  CARDINALITY_MEANING,
  DIRECTIONS,
  describeLine,
  KEYS,
  KEYWORDS,
  LEFT_ENDS,
  LINES,
  RIGHT_ENDS,
  span,
  tokenBefore,
} from './tables.ts';

/** Modes whose text is a value, not code: nothing is offered there. */
const VALUE_MODES = new Set([
  'accTitle',
  'accDescr',
  'accDescrMultiline',
  'blockBq',
  'comment',
  'directive',
  'frontMatter',
]);
const VALUE_KINDS = [T.AccTitleValue, T.AccDescrValue];
const CARDINALITY = [T.ZeroOrOne, T.ZeroOrMore, T.OneOrMore, T.OnlyOne, T.MdParent];
const LINE = new Set<number>([T.Identifying, T.NonIdentifying]);
const ENTITY_NAME = [T.EntityName, T.UnicodeText, T.Num, T.DecimalNum, T.EntityOne];
/** Where a statement ends; `end` closes a subgraph and takes the line break after it. */
const STATEMENT_END = new Set<number>([Kind.Newline, Kind.EOF, T.Semi, T.Eof, T.End, T.BlockStop]);
/** Ids, keywords and numbers: a cursor inside one replaces all of it. */
const isWord = (kind: number) =>
  ['Variable', 'Keyword', 'Number', 'Operator'].includes(erCategories[kind] ?? '');

/** Items filtered by the typed prefix, one per label. */
class Items {
  readonly list: CompletionItem[] = [];
  private readonly seen = new Set<string>();

  constructor(
    readonly prefix: string,
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

function statementBefore(text: string, tokens: TokenStream, at: number): Statement {
  const found: { kind: number; start: number; end: number }[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    const end = tokens.end[i] ?? 0;
    if (end > at) continue;
    if (STATEMENT_END.has(k)) break;
    if (k === Kind.Comment || k === Kind.Directive) continue;
    found.push({ kind: k, start: tokens.start[i] ?? 0, end });
  }
  found.reverse();
  // The lexer skips blanks, so groups are told apart by the text between tokens.
  let groups = 0;
  for (let i = 1; i < found.length; i++) {
    if (/\s/.test(text.slice(found[i - 1]!.end, found[i]!.start))) groups++;
  }
  return {
    head: found[0]?.kind ?? -1,
    prev: found[found.length - 1]?.kind ?? -1,
    groups,
  };
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokenBefore(tokens, o);
  if (i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0) && isWord(tokens.kind[i]!))
    end = tokens.end[i] ?? o;
  // Some tokens take the blanks after them (`end\n  `): the word stops at the first blank.
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** `direction ` written as a whole line so far: a direction is being typed. */
function afterDirection(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[^\S\r\n]*direction[^\S\r\n]+$/i.test(text.slice(lineStart, at));
}

/** Whether `at` starts the first word of its line (an attribute's type position). */
function atLineStart(text: string, at: number): boolean {
  for (let i = at - 1; i >= 0; i--) {
    const c = text.charAt(i);
    if (c === '\n' || c === '\r' || c === '{') return true;
    if (!/\s/.test(c)) return false;
  }
  return true;
}

/**
 * Entity and subgraph names in first-mention order, leaving out the word being typed. A name
 * that does not read back bare is inserted in quotes; where quotes are not read (`bare`: the
 * targets of `class` and `style`), it is not offered.
 */
function entities(
  items: Items,
  doc: DocumentView<ErDocument>,
  except: number,
  bare: boolean
): void {
  const model = doc.result.model as ErModel;
  const subgraphs = new Set(model.subgraphs.map((s) => s.name));
  const aliases = new Map(model.entities.map((e) => [e.name, e.alias]));
  const symbols = doc.result.symbols.filter(
    (s) => (s.kind === 'entity' || s.kind === 'subgraph') && s.name !== ''
  );
  // A name written bare somewhere reads back bare; only the others are checked.
  const writtenBare = new Set<string>();
  for (const s of symbols) {
    if (doc.text.slice(s.range.start, s.range.end) === s.name) writtenBare.add(s.name);
  }
  for (const s of symbols) {
    if (s.range.start === except || !s.name.startsWith(items.prefix)) continue;
    const insert = writtenBare.has(s.name) ? s.name : writtenName(s.name);
    if (insert === undefined || (bare && insert !== s.name)) continue;
    const kind: CompletionKind = subgraphs.has(s.name) ? 'subgraph' : 'node';
    const alias = aliases.get(s.name);
    items.add(s.name, kind, { insertText: insert, ...(alias ? { detail: alias } : {}) });
  }
}

function classes(items: Items, symbols: readonly SymbolOccurrence[], except: number): void {
  for (const s of symbols) {
    if (s.kind === 'class' && s.range.start !== except && s.name !== '') items.add(s.name, 'class');
  }
}

/** Whether the name being typed is a `class` or `style` target (an id list: no quotes). */
const isIdList = (st: Statement): boolean => st.head === T.Class || st.head === T.Style;

/** What an expected name is at this point of the statement. */
function idContext(st: Statement): 'entities' | 'classes' | 'none' {
  if (st.prev === T.StyleSeparator) return 'classes';
  switch (st.head) {
    case T.Class:
      return st.groups === 0 ? 'entities' : 'classes';
    case T.ClassDef:
      return st.groups === 0 ? 'classes' : 'none';
    case T.Style:
      return st.groups === 0 ? 'entities' : 'none';
    case T.Subgraph:
      return 'none';
    default:
      // A relationship's label and an alias are new text.
      return st.prev === T.Colon || st.prev === T.Sqs ? 'none' : 'entities';
  }
}

/** Keywords whose kind the parser tests at the cursor. */
function keywords(items: Items, expected: ReadonlySet<number>): void {
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    const documentation = erDocs[k.kind];
    items.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
}

/** Cardinalities (the end decided by what is before them) and lines. */
function relationshipParts(items: Items, expected: ReadonlySet<number>, st: Statement): void {
  if (CARDINALITY.some((k) => expected.has(k))) {
    const ends = LINE.has(st.prev) ? RIGHT_ENDS : LEFT_ENDS;
    const documentation = erDocs[T.ZeroOrOne] ?? '';
    for (const [symbol, card] of ends) {
      items.add(symbol, 'operator', { detail: CARDINALITY_MEANING[card], documentation });
    }
  }
  if (expected.has(T.Identifying) || expected.has(T.NonIdentifying)) {
    const documentation = erDocs[T.NonIdentifying] ?? '';
    for (const [line, identifying] of LINES) {
      items.add(line, 'operator', { detail: describeLine(identifying), documentation });
    }
  }
  if (expected.has(T.StyleSeparator)) {
    items.add(':::', 'operator', { documentation: erDocs[T.StyleSeparator] ?? '' });
  }
}

/** Inside `{ … }`: keys after a name, the document's types at the start of a line. */
function block(
  items: Items,
  expected: ReadonlySet<number>,
  doc: DocumentView<ErDocument>,
  at: number
): void {
  if (expected.has(T.AttributeKey)) {
    const documentation = erDocs[T.AttributeKey] ?? '';
    for (const [key, meaning] of KEYS)
      items.add(key, 'constant', { detail: meaning, documentation });
  }
  // In an empty block the parser tests only `}`; a type may start there too.
  const typeAt = expected.has(T.AttributeWord) || expected.has(T.BlockStop);
  if (typeAt && atLineStart(doc.text, at)) {
    const model = doc.result.model as ErModel;
    for (const e of model.entities) {
      for (const a of e.attributes) items.add(a.type, 'value', { detail: 'type' });
    }
  }
}

export function erCompletions(probe: ProbeResult, doc: DocumentView<ErDocument>): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || VALUE_MODES.has(probe.mode)) return [];
  const expected = new Set(probe.expected);
  if (VALUE_KINDS.some((k) => expected.has(k))) return [];
  const range = wordRange(text, tokens, probe);
  const items = new Items(text.slice(range.start, probe.offset), range);
  if (probe.mode === 'block') {
    block(items, expected, doc, range.start);
    return items.list;
  }
  if (afterDirection(text, range.start)) {
    for (const [dir, meaning] of DIRECTIONS) items.add(dir, 'constant', { detail: meaning });
    return items.list;
  }
  keywords(items, expected);
  const st = statementBefore(text, tokens, range.start);
  if (ENTITY_NAME.some((k) => expected.has(k)) || expected.has(T.StyleText)) {
    const ids = idContext(st);
    if (ids === 'classes') classes(items, result.symbols, range.start);
    else if (ids === 'entities') entities(items, doc, range.start, isIdList(st));
  }
  relationshipParts(items, expected, st);
  return items.list;
}
