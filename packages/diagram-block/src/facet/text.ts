/**
 * Text and token helpers of the block facet: Markdown code, ranges, the line around an offset,
 * and the token at one.
 */
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { span } from '@mermaid-js/shared/parser/facet';
export { lineBefore } from '@mermaid-js/shared/parser/facet';
export { plural } from '@mermaid-js/shared/parser/facet';
export { span } from '@mermaid-js/shared/parser/facet';
export { code } from '@mermaid-js/shared/parser/facet';

/** A line break as the lexer reads one (`\s` takes the line separators). */
export const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** Where the run of characters matching `re` (one character each) around `at` starts and ends. */
export function runAround(text: string, at: number, re: RegExp, from = 0, to = text.length): Range {
  let start = at;
  while (start > from && re.test(text.charAt(start - 1))) start--;
  let end = at;
  while (end < to && re.test(text.charAt(end))) end++;
  return span(start, end);
}

/**
 * The index of the token of `tokens` that holds `at` (starts at or before it, ends after it),
 * or -1. Tokens are in source order and never overlap; empty ones hold nothing.
 */
export function tokenAt(tokens: TokenStream, at: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let j = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= at) {
      j = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  while (j >= 0 && tokens.start[j] === tokens.end[j]) j--;
  return j >= 0 && at < (tokens.end[j] ?? 0) ? j : -1;
}
