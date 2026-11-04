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

  arrow(a: Arrow): void {
    this.add(a.text, 'operator', { detail: a.draws, documentation: MESSAGE_DOC });
  }
}

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

/** The kind of the first token on the line holding `at`, before `at`; -1 when there is none. */
function lineHead(text: string, tokens: TokenStream, at: number): number {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  let i = tokenBefore(tokens, lineStart);
  if (i < 0 || (tokens.end[i] ?? 0) <= lineStart) i++;
  for (; i < tokens.length && (tokens.start[i] ?? 0) < at; i++) {
    const k = tokens.kind[i]!;
    if (k !== Kind.Space && k !== Kind.Newline) return k;
  }
  return -1;
}

/**
 * `A -|`, `A--|`: the rest of a half-typed arrow on a message line, replacing what was typed
 * of it. Empty when the text before the cursor is no arrow start.
 */
function arrowRest(text: string, tokens: TokenStream, o: number): CompletionItem[] {
  let from = o;
  while (from > 0 && ARROW_CHAR.test(text.charAt(from - 1))) from--;
  // An id may end in `x` or `)`: the typed arrow starts at a `-`, `<`, `/` or `\`.
  while (from < o && !/[-</\\]/.test(text.charAt(from))) from++;
  const typed = text.slice(from, o);
  if (typed === '' || from === 0 || /[\r\n]/.test(text.charAt(from - 1))) return [];
  if (!ARROWS.some((a) => a.text.startsWith(typed) && a.text !== typed)) return [];
  // Only on a message line: one that starts with a participant id.
  if (lineHead(text, tokens, from) !== T.Actor) return [];
  const items = new Items(typed, span(from, o));
  for (const a of ARROWS) if (a.text !== typed) items.arrow(a);
  return items.list;
}

/** Inside `@{ … }`: keys at a key position, participant types after `type:`. */
function participantData(text: string, probe: ProbeResult): CompletionItem[] {
  const o = probe.offset;
  const from = probe.prefix.start;
  const back = (at: number, test: (c: string) => boolean) => {
    let i = at;
    while (i > from && test(text.charAt(i - 1))) i--;
    return i;
  };
  const quote = (c: string) => c === '"' || c === "'";
  const blank = (c: string) => /\s/.test(c);
  const rest = /^[\w-]*/.exec(text.slice(o, o + 64))?.[0].length ?? 0;
  // `type: da|`, `"type": "da|`
  const name = back(o, (c) => /[\w-]/.test(c));
  let k = back(back(name, quote), blank);
  if (k > from && text.charAt(k - 1) === ':') {
    k = back(back(k - 1, blank), quote);
    const at = k - 'type'.length;
    if (
      at >= from &&
      text.slice(at, k) === 'type' &&
      (at === from || /[\s,{"']/.test(text.charAt(at - 1)))
    ) {
      const items = new Items(text.slice(name, o), span(name, o + rest));
      for (const [type, shape] of PARTICIPANT_TYPES) {
        items.add(type, 'constant', { detail: `drawn as ${shape}` });
      }
      return items.list;
    }
  }
  // A key: letters after the start, a `,`, a `{` or a line break (blanks between).
  const key = back(o, (c) => /[A-Za-z]/.test(c));
  const blanks = back(key, blank);
  const atKey =
    blanks === from ||
    /[,{]/.test(text.charAt(blanks - 1)) ||
    /[\r\n]/.test(text.slice(blanks, key));
  if (!atKey) return [];
  const items = new Items(text.slice(key, o), span(key, o + rest));
  for (const k2 of PARTICIPANT_DATA_KEYS) items.add(k2, 'property', { insertText: `${k2}: ` });
  return items.list;
}

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, probe: ProbeResult): Range {
  let end = probe.offset;
  while (end < text.length && WORD.test(text.charAt(end))) end++;
  return span(probe.prefix.start, end);
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
  if (probe.mode === 'CONFIG') return participantData(text, probe);
  if (!CODE_MODES.has(probe.mode) || inText(tokens, probe.offset)) return [];

  const rest = arrowRest(text, tokens, probe.offset);
  if (rest.length > 0) return rest;
  const range = wordRange(text, probe);
  const items = new Items(text.slice(range.start, probe.offset), range);
  const expected = new Set(probe.expected);
  const atStatement = expected.has(T.Participant) && expected.has(T.Note);
  const afterCreate = kindBefore(tokens, range.start) === T.Create;
  for (const k of KEYWORDS) {
    if (!expected.has(k.kind)) continue;
    // `link` is also a participant id; `create destroy` is not a statement.
    if (k.kind === T.Link && !atStatement) continue;
    if (k.kind === T.Destroy && afterCreate) continue;
    const documentation = sequenceDocs[k.kind];
    items.add(k.label, 'keyword', {
      insertText: k.insert ?? k.label,
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  for (const p of PLACEMENTS) {
    if (expected.has(p.kind)) {
      items.add(p.label, 'keyword', { documentation: sequenceDocs[p.kind] ?? '' });
    }
  }
  if (expected.has(T.Actor)) participants(items, doc, range.start);
  for (const a of ARROWS) if (expected.has(a.token)) items.arrow(a);
  return items.list;
}
