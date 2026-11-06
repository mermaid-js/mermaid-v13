/**
 * Timeline hover (DESIGN §4.5, D93): a keyword shows its one-line doc from the grammar file
 * (`generated/docs.ts`). `title` and `section` are one token with their text: only the keyword
 * is hovered. Periods, events and values have no hover (no symbols, D259). Never a preview.
 */
import type { DocumentView, Hover, HoverTarget } from '@mermaid-js/core/parser-kit';
import { timelineDocs } from '../generated/docs.ts';
import type { TimelineDocument } from '../parser/ast.ts';
import { code, span, TEXT_WORDS } from './tables.ts';

export function timelineHover(
  at: HoverTarget,
  doc: DocumentView<TimelineDocument>
): Hover | undefined {
  const t = at.token;
  if (!t) return undefined;
  const docText = timelineDocs[t.kind];
  if (docText === undefined) return undefined;
  const { text } = doc;
  const { start } = t.range;
  const word = TEXT_WORDS[t.kind];
  // The keyword without the blanks (and line break) a token took after it.
  let end = word === undefined ? t.range.end : start + word.length;
  while (end > start && /\s/.test(text.charAt(end - 1))) end--;
  if (at.offset < start || at.offset > end) return undefined;
  const range = span(start, end);
  return { range, contents: `**${code(text.slice(start, end))}**\n\n${docText}` };
}
