/**
 * Kanban completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds and lexer mode, and
 * the line around the cursor, mapped to items.
 *
 * - `kanban` where the parser expects the header.
 * - At a statement start (nothing but the indent before the cursor on its line), once an item is
 *   written above: `::icon()` and `:::`, the decorations of that item; and anywhere there
 *   `accTitle` and `accDescr` (D742).
 * - In `@{ … }` data: the keys v12 reads (`assigned`, `ticket`, `priority`, `label`, `icon`,
 *   `shape`) where a key goes, those the block does not have yet; after `priority:` the four
 *   priorities a card draws (D375); after `assigned:` the assignees of the other cards.
 * - In a `:::` line: the class names the board uses elsewhere, for the word at the cursor.
 *
 * Nothing in a shape, a string, an icon, a comment, a directive or front matter, and nothing
 * where the parser reported an error at the cursor (an item after two blank lines, as in v12).
 * Keywords are matched without regard to case, as the lexer reads `kanban` and `::icon(`.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { kanbanDocs } from '../generated/docs.ts';
import type { KanbanDocument, KanbanItemNode } from '../parser/ast.ts';
import { BAR_PRIORITIES } from '../priority.ts';
import { isBlockData, LINE_BREAK } from '../parser/text.ts';
import { T } from '../parser/tokens.ts';
import { invalidReason } from './names.ts';
import { DATA_KEYS, dataPlace, span } from './tables.ts';
import {
  classItems,
  namesOutside,
  type OutlineKinds,
  outlineKeywords,
  statementStartWord,
} from '@mermaid-js/shared/parser/tree-facet';
import { lineAfter } from '@mermaid-js/shared/parser/facet';

/** A key written in data: after `@{`, a line break or a `,`, before a `:`. */
const WRITTEN_KEY = /(?:^|[\n\r,])[\t ]*([A-Za-z]+)[\t ]*:/g;
/** The kinds of a `:::` class list. */
const CLASSES = { start: T.ClassStart, names: T.Class };
/** The keywords at a statement start. */
const KINDS: OutlineKinds = {
  header: [T.Kanban, 'kanban'],
  nodeId: T.NodeId,
  iconStart: T.IconStart,
  classStart: T.ClassStart,
  accTitle: T.AccTitle,
  accDescr: T.AccDescr,
};

/** The last token of `kind` that starts before `at`, or -1. */
function lastBefore(tokens: TokenStream, at: number, kind: number): number {
  let found = -1;
  for (let j = 0; j < tokens.length && (tokens.start[j] ?? 0) < at; j++) {
    if (tokens.kind[j] === kind) found = j;
  }
  return found;
}

/** The end of the value being written at `at`: the line's end, or (flow data) a `,` or `}`. */
function valueEnd(text: string, at: number, block: boolean): number {
  let end = at;
  while (end < text.length) {
    const ch = text.charAt(end);
    if (LINE_BREAK.test(ch) || (!block && (ch === ',' || ch === '}'))) break;
    end++;
  }
  while (end > at && /[\t ]/.test(text.charAt(end - 1))) end--;
  return end;
}

/** Items in the `@{ … }` data at the probe: keys, priorities, assignees. */
function dataItems(
  doc: DocumentView<KanbanDocument>,
  tokens: TokenStream,
  at: number
): CompletionItem[] {
  const { text } = doc;
  const j = lastBefore(tokens, at, T.ShapeDataStart);
  if (j < 0) return [];
  const open = tokens.start[j] ?? 0;
  // Block pairs or a flow mapping, by the parser's rule (`isBlockData`) on the data as it reads
  // it; data still open is taken to the end of the cursor's line, as typed so far.
  const data = doc.result.ast.children.find(
    (n): n is KanbanItemNode => n.type === 'Item' && n.data?.range.start === open
  )?.data;
  const closed = data !== undefined && text.charAt(data.range.end - 1) === '}';
  const blockEnd = closed ? data.range.end : at + lineAfter(text, at, true).length;
  const block = isBlockData(closed ? data.text : text.slice(open + 2, blockEnd));
  const place = dataPlace(text, open, at, block);
  if (place.key) {
    const prefix = text.slice(place.key.start, at).toLowerCase();
    let to = at;
    while (/[A-Za-z]/.test(text.charAt(to))) to++;
    const range = span(place.key.start, to);
    // A key followed by its `:` already: replace the word only.
    const colon = /^[\t ]*:/.test(text.slice(to));
    const written = new Set<string>();
    for (const m of text.slice(open + 2, blockEnd).matchAll(WRITTEN_KEY)) {
      const k = m[1] ?? '';
      const start = open + 2 + m.index + m[0].indexOf(k);
      if (start !== range.start) written.add(k);
    }
    return DATA_KEYS.filter(([key]) => key.startsWith(prefix) && !written.has(key)).map(
      ([key, documentation]) => ({
        label: key,
        kind: 'property',
        insertText: colon ? key : `${key}: `,
        range,
        documentation,
      })
    );
  }
  const value = place.value;
  if (!value) return [];
  const range = span(value.range.start, valueEnd(text, at, block));
  const typed = text.slice(value.range.start, at).toLowerCase();
  let names: string[] = [];
  let detail: string | undefined;
  if (value.key === 'priority') {
    names = [...BAR_PRIORITIES];
    detail = 'priority';
  } else if (value.key === 'assigned') {
    names = namesOutside(doc.result.symbols, 'assignee', span(open, blockEnd), range).filter(
      (name) => invalidReason(name, 'assignee') === undefined
    );
    detail = 'assignee';
  }
  return names
    .filter((name) => name.toLowerCase().startsWith(typed))
    .map((name) => ({
      label: name,
      kind: 'value',
      insertText: name,
      range,
      ...(detail === undefined ? {} : { detail }),
    }));
}

export function kanbanCompletions(
  probe: ProbeResult,
  doc: DocumentView<KanbanDocument>
): CompletionItem[] {
  const { text, result } = doc;
  const tokens = result.tokens;
  if (!tokens) return [];
  const { mode, offset } = probe;
  if (mode === 'SHAPE_DATA') return dataItems(doc, tokens, offset);
  if (mode !== 'INITIAL' && mode !== 'CLASS') return [];
  const classes = classItems(text, tokens, result.symbols, offset, CLASSES);
  if (classes) return classes;
  if (mode !== 'INITIAL') return [];

  const at = statementStartWord(text, probe, /^[^\s()[\]{}@]*/);
  if (!at) return [];
  // The decorations of the item above: none before the first item (an error).
  const afterNode = result.ast.children.some(
    (n) => n.type === 'Item' && n.range.end <= at.range.start
  );
  return outlineKeywords(at, new Set(probe.expected), KINDS, kanbanDocs, afterNode);
}
