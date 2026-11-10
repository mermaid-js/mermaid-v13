/**
 * Sequence completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode
 * mapped to items. Keywords, note positions and arrows are offered only when the parser tests
 * their kind at the cursor; participant ids where it tests a participant id.
 *
 * Probe edges handled here: a half-typed arrow (`A -|`, `A--|`) lexes as part of the id, since
 * v12 joins a `-` to an id unless an arrow starts there, so the rest of the arrow is offered
 * from the text before the cursor; participant data `@{ … }` is one token, so its key or
 * `type` value is worked out from its text; message, note and block text gets nothing.
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
import { sequenceDocs } from '../generated/docs.ts';
import type { SequenceModel } from '../model.ts';
import type { SequenceDocument } from '../parser/ast.ts';
import { T } from '../parser/tokens.ts';
import {
  ARROWS,
  KEYWORDS,
  MESSAGE_DOC,
  PARTICIPANT_DATA_KEYS,
  PARTICIPANT_TYPES,
  PLACEMENTS,
  span,
  tokenBefore,
} from './tables.ts';
import type { Arrow } from './tables.ts';
import { wordRangeOf } from '@mermaid-js/core/parser-kit/facet';
import { CompletionList as Items } from '@mermaid-js/core/parser-kit/facet';

const arrow = (items: Items, a: Arrow): void =>
  items.add(a.text, 'operator', { detail: a.draws, documentation: MESSAGE_DOC });

/** Lexer modes in which code (not free text) is written. */
const CODE_MODES = new Set(['INITIAL', 'ID', 'ALIAS', 'LINE']);
/** Tokens holding free text: a cursor inside one (or at its end) gets nothing. */
const TEXT_KINDS = new Set<number>([
  T.Txt,
  T.RestOfLine,
  T.AccTitleValue,
  T.AccDescrValue,
  T.AccDescrMultilineValue,
  T.ConfigContent,
]);
/** `title …` is one token: past the keyword, it is text. */
const TITLE_KINDS = new Set<number>([T.Title, T.LegacyTitle]);
/** Characters of the word at the cursor that a completion replaces (an id or a keyword). */
const WORD = /[^\s:;,+<>()-]/;
/** Characters a half-typed arrow is made of. */
const ARROW_CHAR = /[-<>xX)|\\/]/;

/** Whether the cursor is inside free text: a message, note, label or title. */
function inText(tokens: TokenStream, o: number): boolean {
  const i = tokenBefore(tokens, o - 1);
  if (i < 0) return false;
  const start = tokens.start[i] ?? 0;
  const end = tokens.end[i] ?? 0;
  const k = tokens.kind[i]!;
  if (start >= o || end < o) return false;
  if (TEXT_KINDS.has(k)) return true;
  return TITLE_KINDS.has(k) && o > start + 'title'.length;
}

/** Kind of the last significant token ending at or before `at`, or -1. */
function kindBefore(tokens: TokenStream, at: number): number {
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.end[i] ?? 0) > at) continue;
    if (k === Kind.Space || k === Kind.Comment || k === Kind.Directive) continue;
    return k;
  }
  return -1;
}

/** Where statements end: a line break or `;`. */
const STATEMENT_END = new Set<number>([Kind.Newline, T.Semi]);

/**
 * The first significant token of the statement holding `at` (after the last line break or
 * `;` before it), as its index, or -1 when there is none before `at`.
 */
function statementHead(tokens: TokenStream, at: number): number {
  let head = -1;
  for (let i = tokenBefore(tokens, at - 1); i >= 0; i--) {
    const k = tokens.kind[i]!;
    if ((tokens.start[i] ?? 0) >= at) continue;
    if (STATEMENT_END.has(k)) break;
    if (k !== Kind.Space && k !== Kind.Comment && k !== Kind.Directive) head = i;
  }
  return head;
}

const headKind = (tokens: TokenStream, at: number) => {
  const i = statementHead(tokens, at);
  return i < 0 ? -1 : tokens.kind[i]!;
};

/**
 * `A -|`, `A--|`: the rest of a half-typed arrow on a message line, replacing the whole arrow
 * around the cursor. `undefined` when the text before the cursor is no arrow start; empty when
 * it is one but the statement is not a message (`note over A -|`).
 */
function arrowRest(text: string, tokens: TokenStream, o: number): CompletionItem[] | undefined {
  let from = o;
  while (from > 0 && ARROW_CHAR.test(text.charAt(from - 1))) from--;
  // An id may end in `x` or `)`: the typed arrow starts at a `-`, `<`, `/` or `\`.
  while (from < o && !/[-</\\]/.test(text.charAt(from))) from++;
  const typed = text.slice(from, o);
  if (typed === '' || from === 0 || /[\r\n]/.test(text.charAt(from - 1))) return undefined;
  if (!ARROWS.some((a) => a.text.startsWith(typed) && a.text !== typed)) return undefined;
  // Only in a message: a statement that starts with a participant id.
  if (headKind(tokens, from) !== T.Actor) return [];
  // The arrow goes on after the cursor (`A-|>>B`): all of it is replaced.
  let end = o;
  while (end < text.length && /[-<>|\\/]/.test(text.charAt(end))) end++;
  const items = new Items(typed, span(from, end));
  for (const a of ARROWS) if (a.text !== text.slice(from, end)) arrow(items, a);
  return items.list;
}

/**
 * The state of `@{ … }` data at the cursor, read from its start: the keys written so far, and
 * whether the cursor is at a key or in the value of which key. Quoted text is skipped.
 */
function dataState(text: string, from: number, o: number) {
  const written = new Set<string>();
  let atKey = true;
  let key = '';
  let valueOf = '';
  let quote = '';
  const unquote = (k: string) => k.trim().replace(/^["']|["']$/g, '');
  for (let i = from; i < o; i++) {
    const c = text.charAt(i);
    if (quote !== '') {
      if (c === quote) quote = '';
      else if (atKey) key += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === ',' || c === '{' || c === '\n' || c === '\r') {
      atKey = true;
      key = '';
    } else if (c === ':' && atKey) {
      atKey = false;
      valueOf = unquote(key);
      written.add(valueOf);
    } else if (atKey) key += c;
  }
  return { written, atKey, key, valueOf, inQuote: quote !== '' };
}

/** Inside `@{ … }`: keys not yet written at a key position, participant types after `type:`. */
function participantData(text: string, o: number): CompletionItem[] {
  const from = text.lastIndexOf('@{', o) + 2;
  if (from < 2) return [];
  const state = dataState(text, from, o);
  const rest = /^[\w-]*/.exec(text.slice(o, o + 64))?.[0].length ?? 0;
  let word = o;
  while (word > from && /[\w-]/.test(text.charAt(word - 1))) word--;
  const items = new Items(text.slice(word, o), span(word, o + rest));
  if (!state.atKey) {
    if (state.valueOf !== 'type') return [];
    // The value is the word right after `:` (blanks and one opening quote between).
    const before = text.slice(text.lastIndexOf(':', word) + 1, word);
    if (!/^\s*["']?$/.test(before)) return [];
    for (const [type, shape] of PARTICIPANT_TYPES) {
      items.add(type, 'constant', { detail: `drawn as ${shape}` });
    }
    return items.list;
  }
  // A key position: only blanks between the last separator and the word typed.
  if (state.inQuote || state.key.trimStart() !== text.slice(word, o)) return [];
  for (const k of PARTICIPANT_DATA_KEYS) {
    if (!state.written.has(k)) items.add(k, 'property', { insertText: `${k}: ` });
  }
  return items.list;
}

/**
 * `links |`, `title |` with nothing typed after: the keyword's lookahead needs a word after it,
 * so it lexes as a participant id and the parser expects an arrow. `menu` for a menu keyword
 * (a participant id goes next), `title` for `title` (text goes next), else undefined.
 */
function menuOrTitle(text: string, tokens: TokenStream, o: number): 'menu' | 'title' | undefined {
  const i = statementHead(tokens, o);
  if (i < 0 || tokens.kind[i] !== T.Actor) return undefined;
  const word = text.slice(tokens.start[i], o);
  if (/^(?:links|link|properties|details)[^\S\r\n]+$/i.test(word)) return 'menu';
  if (/^title[^\S\r\n]+$/i.test(word)) return 'title';
  return undefined;
}

/** Participant ids in first-mention order, with their labels, leaving out the word typed. */
function participants(items: Items, doc: DocumentView<SequenceDocument>, typedAt: number): void {
  const { model, symbols } = doc.result;
  // The word being typed is a participant of its own while it is the only mention of it.
  const typed = symbols.find((s) => s.kind === 'participant' && s.range.start === typedAt);
  const alone = typed !== undefined && !symbols.some((s) => s !== typed && s.name === typed.name);
  for (const p of (model as SequenceModel).participants) {
    if (alone && p.id === typed.name) continue;
    items.add(p.id, 'node', { detail: p.label === p.id ? p.kind : `${p.kind}: ${p.label}` });
  }
}

export function sequenceCompletions(
  probe: ProbeResult,
  doc: DocumentView<SequenceDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  if (probe.mode === 'CONFIG') return participantData(text, probe.offset);
  if (!CODE_MODES.has(probe.mode) || inText(tokens, probe.offset)) return [];

  const rest = arrowRest(text, tokens, probe.offset);
  if (rest) return rest;
  const menu = menuOrTitle(text, tokens, probe.offset);
  if (menu === 'title') return [];
  const range = wordRangeOf(text, probe, WORD);
  const items = new Items(text.slice(range.start, probe.offset), range);
  const expected = new Set(probe.expected);
  const atStatement = expected.has(T.Participant) && expected.has(T.Note);
  const afterCreate = kindBefore(tokens, range.start) === T.Create;
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    // `link` is also a participant id; `create destroy` is not a statement.
    if (k.kind === T.Link && !atStatement) continue;
    if (k.kind === T.Destroy && afterCreate) continue;
    items.keyword(k, sequenceDocs[k.kind]);
  }
  for (const p of PLACEMENTS) {
    if (expected.has(p.kind)) {
      items.add(p.label, 'keyword', { documentation: sequenceDocs[p.kind] ?? '' });
    }
  }
  if (expected.has(T.Actor) || menu === 'menu') participants(items, doc, range.start);
  if (menu === undefined) for (const a of ARROWS) if (expected.has(a.token)) arrow(items, a);
  return items.list;
}
