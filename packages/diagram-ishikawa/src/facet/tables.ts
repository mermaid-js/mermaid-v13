/**
 * The ishikawa facet's shared helpers (DESIGN §4.5). The keywords are the parser's
 * (`parser/keywords.ts`); their docs come from the grammar file (`generated/docs.ts`).
 */
import type { Range } from '@mermaid-js/core/parser-kit';

/** A line break: what a cause, one line, cannot hold (CR and CRLF read as LF; U+2028/9). */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !LINE_BREAK.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}
