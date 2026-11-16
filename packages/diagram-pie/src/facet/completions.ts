/**
 * Pie completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items. An
 * item is offered only when the parser tests its kind at the cursor: `pie` at the start,
 * `showData` and `title` after `pie`, the statements and a label (`"`) at the start of a line,
 * `:` after a label. Inside a label or a statement's text (probe modes `string`, `title`,
 * `accTitle`, `accDescr`) and outside code nothing is offered; after `:` a value is typed.
 */
import type { CompletionItem, DocumentView, ProbeResult } from '@mermaid-js/core/parser-kit';
import { pieDocs } from '../generated/docs.ts';
import type { PieDocument } from '../parser/ast.ts';
import { HEADER_LINE, ITEMS } from './tables.ts';
import { keywordCompletions, wordRange } from '@mermaid-js/shared/parser/facet';

/** Whether `at` is on the `pie` line, after `pie` (and `showData`). */
function onHeaderLine(text: string, at: number): boolean {
  let lineStart = at;
  while (lineStart > 0 && !/[\r\n]/.test(text.charAt(lineStart - 1))) lineStart--;
  return /^[\t ]*pie(?:[\t ]+showData)?[\t ]+$/.test(text.slice(lineStart, at));
}

export function pieCompletions(
  probe: ProbeResult,
  doc: DocumentView<PieDocument>
): CompletionItem[] {
  if (probe.mode !== 'INITIAL') return [];
  const { text, result } = doc;
  const expected = new Set(probe.expected);
  const range = wordRange(text, result.tokens, probe, /[\s"':]/);
  const prefix = text.slice(range.start, probe.offset);
  const header = onHeaderLine(text, range.start);
  return keywordCompletions(
    ITEMS,
    expected,
    prefix,
    range,
    pieDocs,
    (k) => !header || HEADER_LINE.has(k.kind)
  );
}
