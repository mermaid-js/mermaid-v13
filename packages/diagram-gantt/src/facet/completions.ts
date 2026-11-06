/**
 * Gantt completion (DESIGN §4.5, D95, R-LANG-7). Where a statement may start, the probe's
 * expected kinds decide: the header in an empty text, and the statements (settings, `title`,
 * `section`, `click`, `accTitle`, `accDescr`) at a line start or after the header, each kept
 * only where v12's lexer reads the inserted text as that statement. After `click <ids>`, `href`
 * and `call`; in the ids of a `click`, the task ids written in the chart.
 *
 * Inside a token the lexer reads as one value, the facet reads the text before the cursor, as
 * v12's DB reads it:
 * - task data (`:…`): the tags while only tags come before, `after` and `until`, the task ids
 *   after `after`/`until`, and the duration units after a number;
 * - the day of `weekday`/`weekend`, and the day words of `excludes`/`includes`.
 * Nothing is offered in an accessibility value, a link or a callback, or outside code.
 */
import { Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  SymbolOccurrence,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { ganttDocs } from '../generated/docs.ts';
import type { GanttModel } from '../model.ts';
import type { GanttDocument } from '../parser/ast.ts';
import { lex } from '../parser/lexer.ts';
import { T } from '../parser/tokens.ts';
import {
  CLICK_ACTION_ITEMS,
  DAY_WORDS,
  DURATION_UNITS,
  HEADER_ITEMS,
  isTag,
  lineBefore,
  REFERENCE_WORDS,
  span,
  STATEMENT_ITEMS,
  TAGS,
  taskById,
  WEEKDAYS,
  WEEKENDS,
} from './tables.ts';
import type { KeywordItem } from './tables.ts';

const TRIVIA = new Set<number>([Kind.Comment, Kind.Directive, Kind.Space, Kind.Newline]);

interface Tok {
  kind: number;
  start: number;
  end: number;
}

/** The significant token of `t` holding `offset` (or ending at it). */
function holding(t: TokenStream, offset: number): Tok | undefined {
  for (let j = 0; j < t.length; j++) {
    const start = t.start[j] ?? 0;
    if (start >= offset) break;
    const kind = t.kind[j] ?? Kind.EOF;
    const end = t.end[j] ?? 0;
    if (!TRIVIA.has(kind) && offset <= end) return { kind, start, end };
  }
  return undefined;
}

/** The kind and start of the significant token of `text` holding `offset`, as v12 lexes it. */
function tokenAt(text: string, offset: number): Tok | undefined {
  const pre = preprocess(text);
  const view = sourceView(
    text,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const t = lex(text, pre.bodyStart, view);
  for (let j = 0; j < t.length; j++) {
    const kind = t.kind[j] ?? Kind.EOF;
    const start = t.start[j] ?? 0;
    if (TRIVIA.has(kind) || start > offset) continue;
    const end = t.end[j] ?? 0;
    if (offset < end) return { kind, start, end };
  }
  return undefined;
}

/** The end of the word at `at`: `chars` repeated. */
function wordEnd(text: string, at: number, chars: RegExp): number {
  let end = at;
  while (end < text.length && chars.test(text.charAt(end))) end++;
  return end;
}

/**
 * The text `item` inserts before `rest` (what follows the replaced word): its separator only
 * when `rest` does not already hold one.
 */
function insertText(item: KeywordItem, rest: string): string {
  const sep = item.separator ?? '';
  if (sep === '' || /^[\t ]*[:{"]/.test(rest)) return item.label;
  if (/^[\t ]/.test(rest)) return item.label + sep.trimEnd();
  return item.label + sep;
}

/** The keywords of `items` the parser expects and v12 would read as typed at `start`. */
function keywords(
  items: readonly KeywordItem[],
  probe: ProbeResult,
  text: string,
  expected: ReadonlySet<number>
): CompletionItem[] {
  const start = probe.prefix.start;
  const prefix = text.slice(start, probe.offset).toLowerCase();
  if (/[\n\r]/.test(prefix)) return [];
  // The word being typed, to its end; at a word's first character nothing is replaced.
  const end = prefix === '' ? probe.offset : wordEnd(text, probe.offset, /[^\s:{"]/);
  const head = text.slice(0, start);
  const rest = text.slice(end);
  const out: CompletionItem[] = [];
  for (const k of items) {
    if (!expected.has(k.kind) || !k.label.toLowerCase().startsWith(prefix)) continue;
    const insert = insertText(k, rest);
    const sample = `${head}${insert}${/[ :"]$/.test(insert) ? (k.sample ?? 'x') : ''}${rest}`;
    const t = tokenAt(sample, start);
    if (!t || t.start !== start || !(k.reads ?? [k.kind]).includes(t.kind)) continue;
    const documentation = ganttDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: insert,
      range: span(start, end),
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}

/** The task ids written in the chart (each once, in source order), but those in `skip`. */
function taskIds(
  doc: DocumentView<GanttDocument>,
  skip: Tok | undefined
): { name: string; detail: string }[] {
  const model = doc.result.model as GanttModel | undefined;
  const seen = new Set<string>();
  const out: { name: string; detail: string }[] = [];
  const defs = doc.result.symbols.filter(
    (s: SymbolOccurrence) =>
      s.role === 'def' && !(skip && skip.start <= s.range.start && s.range.end <= skip.end)
  );
  for (const s of defs) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    const task = taskById(model, s.name);
    out.push({ name: s.name, detail: task ? task.text.trim() : 'task' });
  }
  return out;
}

/** Plain words starting with the typed `word` (at `[from, offset)`), replacing it to `end`. */
function words(
  list: readonly (readonly [label: string, detail?: string, doc?: string])[],
  word: string,
  from: number,
  end: number,
  kind: CompletionItem['kind'],
  caseless = false
): CompletionItem[] {
  const typed = caseless ? word.toLowerCase() : word;
  // At a word's first character nothing is replaced.
  const range = word === '' ? span(from, from) : span(from, end);
  const out: CompletionItem[] = [];
  for (const [label, detail, documentation] of list) {
    if (!(caseless ? label.toLowerCase() : label).startsWith(typed)) continue;
    out.push({
      label,
      kind,
      insertText: label,
      range,
      ...(detail === undefined ? {} : { detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}

/** Inside task data `tok`: tags, `after`/`until`, the ids after them, duration units. */
function taskData(doc: DocumentView<GanttDocument>, tok: Tok, offset: number): CompletionItem[] {
  const { text } = doc;
  const before = text.slice(tok.start + 1, offset);
  const parts = before.split(',');
  const cur = parts.pop() ?? '';
  const typed = cur.trimStart();
  const from = offset - typed.length;
  const tagsOnly = parts.every(isTag);
  // The field's index among the fields after the tags.
  const field = parts.filter((p, i) => !parts.slice(0, i + 1).every(isTag)).length;
  if (/^(after|until)\s+[\d\w- ]*$/.test(typed)) {
    const word = /[\d\w-]*$/.exec(typed)?.[0] ?? '';
    const ids = taskIds(doc, tok).map(({ name, detail }) => [name, detail] as const);
    return words(ids, word, offset - word.length, wordEnd(text, offset, /[\d\w-]/), 'node');
  }
  const end = wordEnd(text, offset, /[\w.]/);
  const duration = /^(\d+(?:\.\d+)?)([a-zA-Z]*)$/.exec(typed);
  if (duration) {
    const n = duration[1] ?? '';
    const units = DURATION_UNITS.map(([u, name]) => [`${n}${u}`, name] as const);
    return words(units, typed, from, end, 'constant');
  }
  if (!/^[a-z]*$/.test(typed)) return [];
  const out: CompletionItem[] = [];
  if (tagsOnly) {
    const used = new Set(parts.map((p) => p.trim()));
    const tags = TAGS.filter(([t]) => !used.has(t)).map(([t, d]) => [t, d] as const);
    out.push(...words(tags, typed, from, end, 'keyword'));
  }
  // `after` names a start: the first field, or the second of an id, a start and an end.
  const refs = REFERENCE_WORDS.filter(([w]) => w === 'until' || field <= 1).map(
    ([w, d]) => [`${w} `, undefined, d] as const
  );
  out.push(
    ...words(refs, typed, from, end, 'keyword').map((c) => ({ ...c, label: c.label.trim() }))
  );
  return out;
}

/** The day word being typed: from a blank or `,` to the cursor. */
function days(text: string, offset: number, list: readonly string[]) {
  const word = /[^\s,]*$/.exec(lineBefore(text, offset))?.[0] ?? '';
  const end = wordEnd(text, offset, /[^\s,#;]/);
  return words(
    list.map((d) => [d] as const),
    word,
    offset - word.length,
    end,
    'constant',
    true
  );
}

export function ganttCompletions(
  probe: ProbeResult,
  doc: DocumentView<GanttDocument>
): CompletionItem[] {
  const { text } = doc;
  const offset = probe.offset;
  const tokens = doc.result.tokens;
  const tok = tokens && holding(tokens, offset);
  // In the ids, or in the blanks `click` took (the ids may be on the next line).
  const inKeyword = tok?.kind === T.ClickKeyword && offset >= tok.start + 'click '.length;
  if (probe.mode === 'click' || inKeyword) {
    const word = inKeyword ? '' : (/[^\s,]*$/.exec(lineBefore(text, offset))?.[0] ?? '');
    const ids = taskIds(doc, undefined).map(({ name, detail }) => [name, detail] as const);
    return words(ids, word, offset - word.length, wordEnd(text, offset, /[^\s,]/), 'node');
  }
  if (probe.mode !== 'INITIAL') return [];
  // Task data, or the `:` that starts it.
  if (tok?.kind === T.TaskData || (tok?.kind === T.Colon && offset === tok.end)) {
    return taskData(doc, tok, offset);
  }
  const line = lineBefore(text, offset);
  // `excludes\s…` up to a `#` or `;` (or the bare keyword and one blank, still a task text).
  const dayList = /^[\t ]*(?:excludes|includes)\s[^#;]*$/i.exec(line);
  if (dayList) return days(text, offset, DAY_WORDS);
  const week = /^[\t ]*(weekday|weekend)[\t ]+[a-z]*$/i.exec(line);
  if (week) {
    const list = (week[1] ?? '').toLowerCase() === 'weekday' ? WEEKDAYS : WEEKENDS;
    return days(text, offset, list);
  }
  const expected = new Set(probe.expected);
  const items: KeywordItem[] = [];
  if (/^[\t ]*$/.test(lineBefore(text, probe.prefix.start))) items.push(...HEADER_ITEMS);
  items.push(...CLICK_ACTION_ITEMS, ...STATEMENT_ITEMS);
  return keywords(items, probe, text, expected);
}
