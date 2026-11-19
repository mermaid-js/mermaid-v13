/**
 * c4-beta completion (DESIGN §4.5, D95, R-LANG-7, spec #730 T6): the probe's expected kinds
 * (`beta/probe.ts`) mapped to items, with the tokens before the cursor on its line telling apart
 * the places that expect the same kind.
 *
 * - `c4-beta` first, then the diagram kinds after it.
 * - At a line start: the element kinds, and at the top level the statement words and the ids (a
 *   relation starts with one); in a body the element kinds alone.
 * - After a deployment node's name, `instances`; after an element's name or a relation's end,
 *   the tags in use.
 * - After an id at a line start, the four arrows; after an arrow or a step, the ids.
 * - `direction` and `legend` take their words; `style` takes a target (an element kind or a tag
 *   in use), then keys, then the values a key has (`shape:`, `line:`).
 *
 * Nothing in a text in quotes, a statement's text, a comment, a directive or front matter, on a
 * line that failed, and no id where a new one is declared.
 */
import type {
  CompletionItem,
  CompletionKind,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { Kind } from '@mermaid-js/core/parser-kit';
import {
  insertWithSeparator,
  matchesTyped,
  span,
  tokenBefore,
  wordRangeOf,
} from '@mermaid-js/shared/parser/facet';
import type { C4BetaDocument } from '../beta/ast.ts';
import type { C4BetaModel } from '../beta/model.ts';
import { C4BETA_TRIVIA, T } from '../beta/tokens.ts';
import { c4betaDocs } from '../generated/c4beta.docs.ts';
import { DIAGRAM_KIND_DOCS, ELEMENT_INFO, STYLE_KEY_DOCS, STYLE_KEYS } from './beta-tables.ts';

const ARROWS: readonly (readonly [label: string, kind: number, detail: string])[] = [
  ['-->', T.ArrowRight, 'from the first to the second'],
  ['<--', T.ArrowLeft, 'from the second to the first'],
  ['<-->', T.ArrowBoth, 'both ways'],
  ['---', T.ArrowUndirected, 'no arrowhead'],
];
/** The statement words, in the order offered: the token kind of each, and its separator. */
const STATEMENTS: readonly (readonly [label: string, kind: number, separator: string])[] = [
  ['title', T.Title, ' '],
  ['accTitle', T.AccTitle, ': '],
  ['accDescr', T.AccDescr, ': '],
  ['direction', T.Direction, ' '],
  ['legend', T.Legend, ' '],
  ['style', T.Style, ' '],
];
const DIRECTIONS = ['TB', 'BT', 'LR', 'RL'] as const;
const ON_OFF = ['on', 'off'] as const;
const DIAGRAM_KINDS = ['context', 'container', 'component', 'dynamic', 'deployment'] as const;
const ARROW_KINDS: ReadonlySet<number> = new Set(ARROWS.map(([, kind]) => kind));

/** What a statement word inserts: its separator, unless a blank or a `:` follows already. */
const statementText = (label: string, separator: string, after: string): string =>
  insertWithSeparator(label, separator, after, separator === ' ' ? /^[\t ]/ : /^[\t ]*[:{]/);

/** A character of a word: a word stops at the first blank, quote, comma, brace or `:`. */
const WORD = /[^\s"',{}:]/;

/** A significant token before the cursor on its line. */
interface Before {
  readonly kind: number;
  readonly range: Range;
}

/** The significant tokens before `at` on its line, nearest first. */
function tokensBefore(tokens: TokenStream, at: number): Before[] {
  const out: Before[] = [];
  for (let j = tokenBefore(tokens, at - 1); j >= 0; j--) {
    const kind = tokens.kind[j] ?? Kind.EOF;
    if (kind === Kind.Newline) break;
    if (C4BETA_TRIVIA[kind] !== 1)
      out.push({ kind, range: span(tokens.start[j] ?? 0, tokens.end[j] ?? 0) });
  }
  return out;
}

/** The text of the tag of each `:::tag` token that does not hold `offset`. */
function tagTokens(text: string, tokens: TokenStream, offset: number): string[] {
  const out: string[] = [];
  for (let j = 0; j < tokens.length; j++) {
    const start = tokens.start[j] ?? 0;
    const end = tokens.end[j] ?? 0;
    if (tokens.kind[j] === T.Tag && !(start <= offset && offset <= end))
      out.push(text.slice(start + 3, end));
  }
  return out;
}

/**
 * The tags in use or styled, but not the one being typed or the target of the `style` being
 * written: the cursor's own word names nothing yet.
 */
function tagsIn(doc: DocumentView<C4BetaDocument>, offset: number): string[] {
  const { text, result } = doc;
  const tags = new Set(result.tokens ? tagTokens(text, result.tokens, offset) : []);
  for (const n of result.ast.children) {
    if (n.type !== 'Style' || (n.range.start <= offset && offset <= n.range.end)) continue;
    if (!ELEMENT_INFO.some((i) => i.kind === n.target)) tags.add(n.target);
  }
  return [...tags];
}

/**
 * The items for one word: each label the typed text starts, replacing the word's range. A label
 * is listed once, by whatever adds it first: a kind and an id spelled the same are one entry.
 */
class Items {
  readonly out: CompletionItem[] = [];
  private readonly labels = new Set<string>();
  constructor(
    readonly range: Range,
    readonly typed: string,
    readonly after: string,
    readonly offset: number
  ) {}

  add(label: string, kind: CompletionKind, rest: Partial<CompletionItem> = {}): void {
    if (!matchesTyped(label, this.typed) || this.labels.has(label)) return;
    this.labels.add(label);
    this.out.push({ label, kind, insertText: label, range: this.range, ...rest });
  }

  /** A keyword that stands before more text: a blank follows it unless one does already. */
  word(label: string, rest: Partial<CompletionItem> = {}): void {
    const insertText = /^[\t ]/.test(this.after) ? label : `${label} `;
    this.add(label, 'keyword', { insertText, ...rest });
  }

  /** The ids of the document's elements, with what each is. */
  ids(model: C4BetaModel): void {
    for (const e of model.elements) this.add(e.id, 'node', { detail: `${e.kind} "${e.name}"` });
  }
}

const docOf = (kind: number): Partial<CompletionItem> => {
  const documentation = c4betaDocs[kind];
  return documentation === undefined ? {} : { documentation };
};

/** What every slot reads: the items to add to, what the parser accepts, and where we are. */
interface Slot {
  readonly items: Items;
  readonly expected: ReadonlySet<number>;
  readonly doc: DocumentView<C4BetaDocument>;
  readonly model: C4BetaModel;
  /** The significant tokens before the word on its line, nearest first. */
  readonly before: readonly Before[];
}

/** After `c4-beta`: the diagram kinds. */
function diagramKinds({ items }: Slot) {
  for (const kind of DIAGRAM_KINDS)
    items.add(kind, 'keyword', { documentation: DIAGRAM_KIND_DOCS[kind] ?? '' });
}

/** At a line start: element kinds; at the top level also statement words and the ids. */
function lineStart({ items, expected, model }: Slot) {
  for (const info of ELEMENT_INFO) {
    if (expected.has(info.token))
      items.word(info.kind, { detail: info.line, documentation: info.doc });
  }
  if (!expected.has(T.Title)) return;
  for (const [label, kind, separator] of STATEMENTS) {
    const insertText = statementText(label, separator, items.after);
    items.add(label, 'keyword', { insertText, ...docOf(kind) });
  }
  if (expected.has(T.Id)) items.ids(model);
}

function arrows({ items }: Slot) {
  for (const [label, kind, detail] of ARROWS)
    items.add(label, 'operator', { detail, ...docOf(kind) });
}

function directions({ items }: Slot) {
  for (const d of DIRECTIONS) items.add(d, 'constant');
}

function onOff({ items }: Slot) {
  for (const d of ON_OFF) items.add(d, 'constant');
}

/** A `style` target: an element kind, or a tag in use. */
function styleTargets({ items }: Slot, tags: readonly string[]) {
  for (const info of ELEMENT_INFO) items.add(info.kind, 'keyword', { detail: 'element kind' });
  for (const tag of tags) items.add(tag, 'class', { detail: 'tag' });
}

/** The fixed values of the style key at `range`. */
function styleValues({ items, doc }: Slot, range: Range) {
  for (const value of STYLE_KEYS[doc.text.slice(range.start, range.end)] ?? [])
    items.add(value, 'value');
}

/** The keys of a style entry, each with its colon. */
function styleKeys({ items }: Slot) {
  for (const key of Object.keys(STYLE_KEYS)) {
    const documentation = STYLE_KEY_DOCS[key] ?? '';
    items.add(key, 'property', { insertText: `${key}:`, documentation });
  }
}

/** In a `style` line: a target, a key, or a value of the key before the colon. */
function styleSlot(slot: Slot, tags: readonly string[]) {
  const [one, two] = slot.before;
  if (one?.kind === T.Style) styleTargets(slot, tags);
  else if (one?.kind === T.Colon && two !== undefined) styleValues(slot, two.range);
  else styleKeys(slot);
}

/** Where an id goes: a relation's end after an arrow or a step, a `style`, else a new one. */
function idSlot(slot: Slot) {
  const { before, items, model, doc } = slot;
  const [one, two] = before;
  if (before[before.length - 1]?.kind === T.Style) styleSlot(slot, tagsIn(doc, items.offset));
  else if (one !== undefined && (ARROW_KINDS.has(one.kind) || two?.kind === T.Step))
    items.ids(model);
}

/** The place the parser expects each kind at: the first listed kind it expects decides. */
const SLOTS: readonly (readonly [kind: number, fill: (slot: Slot) => void])[] = [
  [T.Context, diagramKinds],
  [T.Person, lineStart],
  [T.ArrowRight, arrows],
  [T.Tb, directions],
  [T.On, onOff],
  [T.Id, idSlot],
];

export function c4betaCompletions(
  probe: ProbeResult,
  doc: DocumentView<C4BetaDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL' || !doc.result.tokens) return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRangeOf(text, probe, WORD);
  const typed = text.slice(range.start, probe.offset);
  const items = new Items(range, typed, text.slice(range.end), probe.offset);
  const before = tokensBefore(doc.result.tokens, range.start);
  const slot: Slot = { items, expected, doc, model: result.model as C4BetaModel, before };
  if (expected.has(T.Header)) items.word('c4-beta', docOf(T.Header));
  SLOTS.find(([kind]) => expected.has(kind))?.[1](slot);
  // Words that end a line's fields, wherever the line is.
  if (expected.has(T.Instances) && before[before.length - 1]?.kind === T.DeploymentNode)
    items.word('instances', docOf(T.Instances));
  if (expected.has(T.Tag))
    for (const tag of tagsIn(doc, probe.offset)) items.add(`:::${tag}`, 'class', { detail: 'tag' });
  return items.out;
}
