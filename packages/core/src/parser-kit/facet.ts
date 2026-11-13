/**
 * Helpers every diagram's language facet (DESIGN §4.5) used to carry a copy of: a range, the
 * token before an offset, and Markdown inline code. A subpath of its own, so that only the
 * `./language` entries load it (DESIGN §2).
 */
import type { Range } from './positions.ts';
import type { TokenStream } from './tokens.ts';

export const span = (start: number, end: number): Range => ({ start, end });

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** Index of the last token of `tokens` starting at or before `offset`, or -1. */
export function tokenBefore(tokens: TokenStream, offset: number): number {
  let lo = 0;
  let hi = tokens.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((tokens.start[mid] ?? 0) <= offset) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}
