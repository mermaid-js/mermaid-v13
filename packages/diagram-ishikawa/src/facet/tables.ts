/**
 * The ishikawa facet's shared helpers (DESIGN §4.5). The keywords are the parser's
 * (`parser/keywords.ts`); their docs come from the grammar file (`generated/docs.ts`).
 */
export { code, span } from '@mermaid-js/core/parser-kit/facet';

/** A line break: what a cause, one line, cannot hold (CR and CRLF read as LF; U+2028/9). */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** The text of `at`'s line before `at`. */
export function lineBefore(text: string, at: number): string {
  let start = at;
  while (start > 0 && !LINE_BREAK.test(text.charAt(start - 1))) start--;
  return text.slice(start, at);
}
