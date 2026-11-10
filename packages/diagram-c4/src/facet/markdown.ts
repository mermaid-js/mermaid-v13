/** Markdown and range helpers the C4 facet's completion and hover share. */
import type { Range } from '@mermaid-js/core/parser-kit';

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });

/** The text of the line before `at`. */
export function lineBefore(text: string, at: number): string {
  let from = at;
  while (from > 0 && !/[\n\r]/.test(text.charAt(from - 1))) from--;
  return text.slice(from, at);
}
