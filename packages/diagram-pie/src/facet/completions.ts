/**
 * Pie completion (DESIGN §4.5, D95, R-LANG-7): the probe's expected kinds mapped to items. An
 * item is offered only when the parser tests its kind at the cursor: `pie` at the start,
 * `showData` and `title` after `pie`, the statements and a label (`"`) at the start of a line,
 * `:` after a label. Inside a label or a statement's text (probe modes `string`, `title`,
 * `accTitle`, `accDescr`) and outside code nothing is offered; after `:` a value is typed.
 */
import type {
  CompletionItem,
  DocumentView,
  ProbeResult,
  Range,
  TokenStream,
} from '@mermaid-js/core/parser-kit';
import { pieDocs } from '../generated/docs.ts';
import type { PieDocument } from '../parser/ast.ts';
import { HEADER_LINE, ITEMS, span, tokenBefore } from './tables.ts';

/** The probed word's range: the prefix, plus the rest of the word after the cursor. */
function wordRange(text: string, tokens: TokenStream | undefined, probe: ProbeResult): Range {
  const o = probe.offset;
  let end = o;
  const i = tokens ? tokenBefore(tokens, o) : -1;
  if (tokens && i >= 0 && (tokens.start[i] ?? 0) < o && o < (tokens.end[i] ?? 0))
    end = tokens.end[i] ?? o;
  // A word stops at the first blank, line break, quote or `:` after the cursor.
  const stop = /[\s"':]/.exec(text.slice(o, end));
  if (stop) end = o + stop.index;
  return span(probe.prefix.start, end);
}

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
  const range = wordRange(text, result.tokens, probe);
  const prefix = text.slice(range.start, probe.offset);
  const header = onHeaderLine(text, range.start);
  const out: CompletionItem[] = [];
  for (const k of ITEMS) {
    if (!expected.has(k.kind) || (header && !HEADER_LINE.has(k.kind))) continue;
    if (!k.label.startsWith(prefix)) continue;
    const documentation = pieDocs[k.kind];
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
