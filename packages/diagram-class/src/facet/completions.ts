/**
 * Class completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only when the parser tests their kind at the cursor;
 * the tokens before the cursor in its statement tell name kinds apart (a class after an
 * arrow or `note for`, a style class after `:::` or in `cssClass "A" |`, an annotation after
 * `<<`).
 *
 * Probe edges handled here: right after `--`, `..`, `<|` and the like, the rest of the arrow
 * is offered, replacing what was typed of it (the arrow is several tokens); `direction` alone
 * on a line lexes as a class name, so the line is checked by text; class bodies, strings,
 * generics and accessibility text get nothing.
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
import { span, tokenBefore } from '@mermaid-js/core/parser-kit/facet';
import { classCategories } from '../generated/categories.ts';
import { classDocs } from '../generated/docs.ts';
import type { ClassDocument } from '../parser/ast.ts';
import type { ClassModel } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import {
  ANNOTATIONS,
  ARROW_PARTS,
  ARROWS,
  DIRECTIONS,
  describeRelation,
  KEYWORDS,
  LINK_TARGETS,
} from './tables.ts';
import type { Arrow } from './tables.ts';

/** Modes in which a statement is being written (`class` is after the `class` keyword). */
const CODE_MODES = new Set(['INITIAL', 'class', 'namespace', 'namespace-body']);
/** Kinds that make up a name word (the rest of the word after the cursor is replaced too). */
const NAME_PART = new Set<number>([T.Alpha, T.Num, T.Minus, T.UnicodeText]);
const isName = (kind: number) => NAME_PART.has(kind) || kind === T.BquoteStr;
/** Names, keywords and directions: a cursor inside one replaces all of it. */
const isWord = (kind: number) =>
  NAME_PART.has(kind) || ['Keyword', 'Constant'].includes(classCategories[kind]!);
const BLANK = new Set<number>([T.Space, Kind.Space]);
/** Where a statement ends; braces open and close bodies. */
const STATEMENT_END = new Set<number>([Kind.Newline, T.Eof, Kind.EOF, T.StructStart, T.StructStop]);
/** Statement keywords after which the first word is a class name. */
const CLASS_FIRST = new Set<number>([T.Class, T.NoteFor, T.Style, T.Callback, T.Link, T.Click]);

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
  /** Significant token kinds from the statement start to the word. */
  kinds: number[];
  /** Kind of the first, or -1 at a statement start. */
  head: number;
  /** Kind of the last, or -1. */
  prev: number;
  /** Blank-separated groups after the head (`style A |` has one). */
  groups: number;
}

function statementBefore(text: string, tokens: TokenStream, at: number): Statement {
  const found: number[] = [];
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    // A line break token takes the blanks around it: one with a line break before the cursor
    // (`\n  |\n`) ends the statement before it; one starting with blanks (`A | \n`) does not.
    if ((tokens.end[i] ?? 0) > at) {
      const before = text.slice(tokens.start[i] ?? at, at);
      if (STATEMENT_END.has(k) && /[\r\n]/.test(before)) break;
      continue;
    }
    if (STATEMENT_END.has(k)) break;
    if (k === Kind.Comment || k === Kind.Directive || BLANK.has(k)) continue;
    found.push(i);
  }
  found.reverse();
  const kinds = found.map((i) => tokens.kind[i]!);
  let groups = 0;
  for (let j = 1; j < found.length; j++) {
    const gap = text.slice(tokens.end[found[j - 1]!] ?? 0, tokens.start[found[j]!] ?? 0);
    if (/\s/.test(gap)) groups++;
  }
  return { kinds, head: kinds[0] ?? -1, prev: kinds[kinds.length - 1] ?? -1, groups };
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
  // Never past a blank after the cursor: a range stays on the cursor's line.
  const blank = /\s/.exec(text.slice(o, end));
  if (blank) end = o + blank.index;
  return span(probe.prefix.start, end);
}

/** Names of `kind` in first-mention order, leaving out the word being typed. */
function names(
  items: Items,
  symbols: readonly SymbolOccurrence[],
  kind: string,
  except: number,
  as: CompletionKind,
  detailOf?: (name: string) => string | undefined
): void {
  for (const s of symbols) {
    if (s.kind !== kind || s.range.start === except || s.name === '') continue;
    const detail = detailOf?.(s.name);
    items.add(s.name, as, detail === undefined ? {} : { detail });
  }
}

function arrowItem(items: Items, a: Arrow): void {
  items.add(a.text, 'operator', {
    detail: describeRelation(a.start, a.line, a.end),
    documentation: classDocs[T.Line] ?? '',
  });
}

/** What an arrow may start with: its own tokens, and `-` or `.` typed alone. */
const ARROW_START = new Set<number>([...ARROW_PARTS, T.Minus, T.Dot]);

/**
 * `A --|`, `A <||`, `A -|`: the rest of the arrow after a class name, replacing what was
 * typed of it (an arrow is several tokens, and `-` or `.` alone lex as name parts).
 */
function arrowRest(text: string, tokens: TokenStream, o: number): CompletionItem[] {
  let i = tokenBefore(tokens, o - 1);
  if (i < 0 || (tokens.end[i] ?? 0) !== o || !ARROW_START.has(tokens.kind[i]!)) return [];
  let from = tokens.start[i] ?? o;
  while (i > 0 && ARROW_START.has(tokens.kind[i - 1]!) && tokens.end[i - 1] === from) {
    i--;
    from = tokens.start[i] ?? from;
  }
  // Arrow head tokens take the blanks before them (`A <|`).
  const typed = text.slice(from, o).trimStart();
  const at = o - typed.length;
  if (typed === '' || /\s/.test(typed) || !/\s/.test(text.charAt(at - 1))) return [];
  const st = statementBefore(text, tokens, at);
  if (!isName(st.head) || st.kinds.some((k) => ARROW_PARTS.has(k))) return [];
  const items = new Items(typed, span(at, o));
  for (const a of ARROWS) if (a.text !== typed) arrowItem(items, a);
  return items.list;
}

/** Kinds of the keywords that start a statement (every keyword but `call` and `href`). */
const CLICK_ACTIONS = new Set<number>([T.CallbackName, T.Href]);

/**
 * Keywords and link targets whose kind the parser tests at the cursor: statement keywords at
 * a statement start only (a style value may be any word, `style A |` tests `style` too), and
 * `call` / `href` right after `click Class`.
 */
function byKind(items: Items, expected: ReadonlySet<number>, st: Statement): void {
  const clickAction = st.head === T.Click && st.groups === 1;
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    if (CLICK_ACTIONS.has(k.kind) ? !clickAction : st.head !== -1) continue;
    const documentation = classDocs[k.kind];
    items.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  if (expected.has(T.LinkTarget)) for (const t of LINK_TARGETS) items.add(t, 'constant');
}

/** `direction ` written as a whole line so far. */
function afterDirection(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[^\S\r\n]*direction[^\S\r\n]+$/.test(text.slice(lineStart, at));
}

type NameContext = 'classes' | 'styleClasses' | 'annotations' | 'arrows' | 'label' | 'none';

/** What an expected name is at this point of the statement. */
function nameContext(st: Statement): NameContext {
  const { head, prev, groups, kinds } = st;
  if (prev === T.StyleSeparator) return 'styleClasses';
  if (prev === T.AnnotationStart) return 'annotations';
  if (prev === T.AnnotationEnd) return head === T.AnnotationStart ? 'classes' : 'none';
  if (head === -1) return 'classes';
  if (CLASS_FIRST.has(head)) return groups === 0 ? 'classes' : 'none';
  if (head === T.ClassDef) return groups === 0 || prev === T.Comma ? 'styleClasses' : 'none';
  if (head === T.CssClass) return prev === T.Str ? 'styleClasses' : 'none';
  if (!isName(head)) return 'none';
  // A statement led by a class name: a relationship, or `A : member`.
  const arrowAt = kinds.findIndex((k) => ARROW_PARTS.has(k));
  if (arrowAt < 0) return prev === T.Label ? 'none' : 'arrows';
  const rest = kinds.slice(arrowAt);
  if (rest.every((k) => ARROW_PARTS.has(k) || k === T.Str)) return 'classes';
  // `A --> B |`: the relationship's `: label` may follow.
  return rest.includes(T.Label) ? 'none' : 'label';
}

/** The names, annotations or operators a {@link NameContext} offers. */
function contextItems(
  items: Items,
  context: NameContext,
  expected: ReadonlySet<number>,
  symbols: readonly SymbolOccurrence[],
  at: number,
  labels: ReadonlyMap<string, string>
): void {
  const name = expected.has(T.Alpha);
  if (context === 'classes' && name) {
    names(items, symbols, 'class', at, 'class', (id) => {
      const label = labels.get(id);
      return label === undefined || label === id ? undefined : label;
    });
  } else if (context === 'styleClasses' && name) {
    names(items, symbols, 'cssClass', at, 'constant', () => 'style class');
  } else if (context === 'annotations' && name) {
    for (const [a, meaning] of ANNOTATIONS) items.add(a, 'constant', { detail: meaning });
  } else if (context === 'arrows' || context === 'label') {
    if (context === 'arrows' && expected.has(T.Line)) for (const a of ARROWS) arrowItem(items, a);
    if (expected.has(T.Label)) {
      const detail = context === 'arrows' ? 'a member, or a label' : 'a label';
      items.add(':', 'operator', { insertText: ': ', detail });
    }
  }
}

export function classCompletions(
  probe: ProbeResult,
  doc: DocumentView<ClassDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const rest = arrowRest(text, tokens, probe.offset);
  if (rest.length > 0) return rest;
  if (!CODE_MODES.has(probe.mode)) return [];

  const range = wordRange(text, tokens, probe);
  const items = new Items(text.slice(range.start, probe.offset), range);
  if (afterDirection(text, range.start)) {
    for (const [dir, meaning] of DIRECTIONS) items.add(dir, 'constant', { detail: meaning });
    return items.list;
  }
  const expected = new Set(probe.expected);
  const st = statementBefore(text, tokens, range.start);
  const model = result.model as ClassModel | undefined;
  const labels = new Map((model?.classes ?? []).map((c) => [c.id, c.label]));
  const context = nameContext(st);
  // `click A call |`: a function name goes here (the lexer reads `call` with it).
  const line = text.slice(text.lastIndexOf('\n', range.start - 1) + 1, range.start);
  if (st.head === T.Click && /(?:^|\s)call[^\S\r\n]+$/.test(line)) return [];
  if (context !== 'arrows' && context !== 'label') byKind(items, expected, st);
  contextItems(items, context, expected, result.symbols, range.start, labels);
  return items.list;
}
