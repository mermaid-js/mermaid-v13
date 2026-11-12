/**
 * State completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords are offered only when the parser tests their kind at the cursor.
 *
 * Where v12's lexer gives the parser nothing to test, the line before the cursor decides
 * (`note |`, `note left of |`, `direction |`, `state x |`, `class |`, `classDef |`): jison's
 * rules there take the blanks and line break after a keyword, or fail on a half-typed word.
 * Text (descriptions, labels, notes, values, comments) gets nothing.
 */
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { stateCategories } from '../generated/categories.ts';
import { stateDocs } from '../generated/docs.ts';
import type { StateDocument } from '../parser/ast.ts';
import type { StateModel } from '../parser/model.ts';
import { T } from '../parser/tokens.ts';
import { DIRECTIONS, HEADERS, KEYWORDS, KIND_NAMES, MARKERS, span, tokenBefore } from './tables.ts';
import { CompletionList as Items } from '@mermaid-js/shared/parser/facet';

/** Lexer modes whose text is free text, not code. */
const TEXT_MODES = new Set([
  'comment',
  'directive',
  'frontMatter',
  'NOTE_TEXT',
  'FLOATING_NOTE',
  'STATE_STRING',
  'acc_title',
  'acc_descr',
  'acc_descr_multiline',
  'CLASSDEFID',
  'STYLEDEF_STYLES',
  'SCALE',
]);
/** Characters of a state id or keyword word (the rest of it after the cursor is replaced). */
const WORD = /[^\s:;,{}"-]/;

interface Context {
  text: string;
  model: StateModel;
  symbols: DocumentView<StateDocument>['result']['symbols'];
  offset: number;
}

/** Whether the token holding the cursor is text (a description, label, note or value). */
function inText(tokens: TokenStream, o: number): boolean {
  const i = tokenBefore(tokens, o - 1);
  if (i < 0 || (tokens.end[i] ?? 0) < o || (tokens.start[i] ?? 0) >= o) return false;
  const category = stateCategories[tokens.kind[i]!];
  return category === 'String' || category === 'Comment';
}

/** Items replacing `[from, end of the word at the cursor)`, filtered by what is typed. */
function itemsFrom(c: Context, from: number): Items {
  let end = c.offset;
  while (end < c.text.length && WORD.test(c.text.charAt(end))) end++;
  return new Items(c.text.slice(from, c.offset), span(from, end));
}

/** State ids in first-mention order, leaving out the word being typed. */
function states(items: Items, c: Context, from: number): void {
  const byId = new Map(c.model.states.map((s) => [s.id, s]));
  for (const s of c.symbols) {
    if (s.kind !== 'state' || s.range.start === from || s.name === '') continue;
    const node = byId.get(s.name);
    const kind: CompletionKind = node?.kind === 'composite' ? 'subgraph' : 'node';
    const label = node?.descriptions.join(' ');
    let detail: string | undefined;
    if (label) detail = label;
    else if (node && node.kind !== 'plain') detail = KIND_NAMES[node.kind];
    items.add(s.name, kind, detail === undefined ? {} : { detail });
  }
}

/** Class names: `classDef`s, then those only used. */
function classes(items: Items, c: Context, from: number): void {
  for (const k of c.model.classes) items.add(k.id, 'class');
  for (const s of c.symbols) {
    if (s.kind === 'class' && s.range.start !== from && s.name !== '') items.add(s.name, 'class');
  }
}

function directions(items: Items): CompletionItem[] {
  for (const [dir, meaning] of DIRECTIONS) items.add(dir, 'constant', { detail: meaning });
  return items.list;
}

/** Contexts read from the line before the cursor; undefined when none applies. */
function byLine(c: Context): CompletionItem[] | undefined {
  const o = c.offset;
  let lineStart = o;
  while (lineStart > 0 && !/[\r\n]/.test(c.text.charAt(lineStart - 1))) lineStart--;
  const line = c.text.slice(lineStart, o);
  // A statement line is short; the patterns below are not run on a long one (pitfall 5).
  if (line.length > 512) return undefined;
  // The word being typed: what the line ends with.
  // eslint-disable-next-line mermaid/no-nested-quantifier -- run on the last 256 characters of a line at most
  const typed = /[^\s:;,{}"-]*$/.exec(line.slice(-256))?.[0] ?? '';
  const from = o - typed.length;
  const head = line.slice(0, line.length - typed.length);
  if (/^\s*direction\s+$/i.test(head)) return directions(itemsFrom(c, from));
  if (/^\s*note\s+$/i.test(head)) {
    const items = itemsFrom(c, from);
    for (const side of ['left of', 'right of']) {
      items.add(side, 'keyword', { documentation: stateDocs[T.Note] ?? '' });
    }
    return items.list;
  }
  if (
    /^\s*(?:note\s+(?:left|right)\s+of|click)\s+$/i.test(head) ||
    /^\s*(?:class|style)\s+(?:[\w\s,]*,)?\s*$/i.test(head)
  ) {
    const items = itemsFrom(c, from);
    states(items, c, from);
    return items.list;
  }
  if (/^\s*(?:classDef|class\s+[\w,]+)\s+$/i.test(head) || head.endsWith(':::')) {
    const items = itemsFrom(c, from);
    classes(items, c, from);
    return items.list;
  }
  if (/^\s*state\s+[^\s"]+\s+$/i.test(head) && /^(?:<<\w*|\[\[\w*|)$/.test(typed)) {
    const items = itemsFrom(c, from);
    const square = typed.startsWith('[');
    for (const [angle, sq, kind] of MARKERS) {
      items.add(square ? sq : angle, 'keyword', {
        detail: `${kind} pseudo-state`,
        documentation: stateDocs[T.Fork] ?? '',
      });
    }
    // `state x {` opens a composite; its error until the `}` is `UNCLOSED_COMPOSITE` (#148).
    if (typed === '') items.add('{', 'operator', { detail: 'composite state body' });
    return items.list;
  }
  return undefined;
}

const TOP_LEVEL_ONLY = new Set<number>([T.ClassDef, T.Class, T.Style, T.Click, T.Scale]);

/** Keywords, operators and ids whose kinds the parser tests at the cursor. */
function byKind(c: Context, probe: ProbeResult): CompletionItem[] {
  const from = probe.prefix.start;
  const items = itemsFrom(c, from);
  const expected = new Set(probe.expected);
  if (expected.has(T.Sd)) {
    for (const h of HEADERS) items.add(h, 'keyword', { documentation: stateDocs[T.Sd] ?? '' });
    return items.list;
  }
  // Inside a composite (`}` can follow) these statements do nothing (IGNORED_IN_COMPOSITE,
  // SCALE_IGNORED): v12 reads them from the top level only, so they are not offered there.
  const inComposite = expected.has(T.StructStop);
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind) || (inComposite && TOP_LEVEL_ONLY.has(k.kind))) continue;
    items.keyword(k, stateDocs[k.kind]);
  }
  if (expected.has(T.Id)) states(items, c, from);
  if (expected.has(T.EdgeState)) items.add('[*]', 'constant', { detail: 'start or end state' });
  if (expected.has(T.Concurrent)) {
    items.add('--', 'operator', { documentation: stateDocs[T.Concurrent] ?? '' });
  }
  if (expected.has(T.StructStop)) items.add('}', 'operator', { detail: 'end of composite state' });
  // Inside a composite v12 reads no line breaks: an arrow or `:::` at the start of a line
  // would continue the statement before it, which is never what is being typed.
  const lineStart = /(?:^|[\r\n])[^\S\r\n]*$/.test(c.text.slice(Math.max(0, from - 256), from));
  if (lineStart) return items.list;
  if (expected.has(T.Arrow)) {
    items.add('-->', 'operator', { documentation: stateDocs[T.Arrow] ?? '' });
  }
  if (expected.has(T.StyleSeparator)) {
    items.add(':::', 'operator', { documentation: stateDocs[T.StyleSeparator] ?? '' });
  }
  return items.list;
}

export function stateCompletions(
  probe: ProbeResult,
  doc: DocumentView<StateDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens || TEXT_MODES.has(probe.mode)) return [];
  if (inText(tokens, probe.offset)) return [];
  const c: Context = {
    text,
    model: result.model as StateModel,
    symbols: result.symbols,
    offset: probe.offset,
  };
  return byLine(c) ?? byKind(c, probe);
}
