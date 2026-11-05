/**
 * Timeline completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to
 * items. An item is offered only when the parser tests its kind at the cursor: the header in
 * an empty text, `LR` and `TD` after a bare `timeline` on its line, and `title`, `section`,
 * `accTitle` and `accDescr` at the start of a line. Elsewhere on a line the text is a period,
 * an event, a title or a section name, where nothing is offered; so is an accessibility value
 * (probe modes `acc_title`, `acc_descr`, `acc_descr_multiline`) and everything outside code.
 * Keywords are matched without regard to case, as the lexer reads them.
 */
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { timelineDocs } from '../generated/docs.ts';
import type { TimelineDocument } from '../parser/ast.ts';
import { DIRECTION_ITEMS, LINE_ITEMS, lineBefore, span } from './tables.ts';
import type { KeywordItem } from './tables.ts';

const HEADER_LINE = /^[\t ]*timeline[\t ]+$/i;

export function timelineCompletions(
  probe: ProbeResult,
  doc: DocumentView<TimelineDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text } = doc;
  const start = probe.prefix.start;
  const prefix = text.slice(start, probe.offset).toLowerCase();
  if (/[\n\r]/.test(prefix)) return [];
  const before = lineBefore(text, start);
  let items: readonly KeywordItem[];
  if (HEADER_LINE.test(before)) items = DIRECTION_ITEMS;
  else if (/^[\t ]*$/.test(before)) items = LINE_ITEMS;
  else return [];
  // The word being typed, to its end: up to a blank, a line break or a `:`.
  const end = probe.offset + (/^[^\s:]*/.exec(text.slice(probe.offset))?.[0].length ?? 0);
  const range = span(start, end);
  const expected = new Set(probe.expected);
  const out: CompletionItem[] = [];
  for (const k of items) {
    if (!expected.has(k.kind) || !k.label.toLowerCase().startsWith(prefix)) continue;
    const documentation = timelineDocs[k.kind];
    out.push({
      label: k.label,
      kind: k.item,
      insertText: k.insert ?? k.label,
      range,
      ...(k.detail === undefined ? {} : { detail: k.detail }),
      ...(documentation === undefined ? {} : { documentation }),
    });
  }
  return out;
}
