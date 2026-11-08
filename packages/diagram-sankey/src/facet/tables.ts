/**
 * Helpers the sankey completion and hover share: token lookup, the row a token is on, and
 * Markdown code spans.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { SankeyKind as T } from '../parser/tokens.ts';

const LINE_BREAK = /[\n\r]/;

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

/** Where a field starts on its row: which field it is (0 source, 1 target, 2 value). */
export interface FieldAt {
  index: number;
  /** The row's first token. */
  rowStart: number;
}

/**
 * Which field of its row starts at `offset` of `text`: the commas before it on its line,
 * counted back from the last token that ends at or before it. A line break between tokens
 * (one v12 trimmed off the end of the text) also ends a row.
 */
export function fieldAt(text: string, tokens: TokenStream, offset: number): FieldAt {
  let j = tokenBefore(tokens, offset);
  while (j >= 0 && (tokens.end[j] ?? 0) > offset) j--;
  let index = 0;
  let after = offset;
  for (; j >= 0; j--) {
    const k = tokens.kind[j];
    if (k === Kind.Newline || k === T.Sankey) break;
    if (LINE_BREAK.test(text.slice(tokens.end[j] ?? 0, after))) break;
    if (k === T.Comma) index++;
    after = tokens.start[j] ?? 0;
  }
  return { index, rowStart: j + 1 };
}

/** The name a row's first field writes, read as v12 did (trimmed, `""` as `"`), if any. */
export function sourceName(
  text: string,
  tokens: TokenStream,
  rowStart: number
): string | undefined {
  let j = rowStart;
  const skip = (k: number | undefined) =>
    k === Kind.Comment || k === Kind.Directive || k === Kind.Space;
  while (j < tokens.length && skip(tokens.kind[j])) j++;
  const k = tokens.kind[j];
  if (k === T.OpenQuote) j++;
  else if (k !== T.Text) return undefined;
  if (k === T.OpenQuote && tokens.kind[j] !== T.EscapedText) return undefined;
  const raw = text.slice(tokens.start[j] ?? 0, tokens.end[j] ?? 0);
  return (k === T.OpenQuote ? raw.replaceAll('""', '"') : raw).trim();
}

/** Markdown inline code holding `text` as written, whatever backticks it has. */
export function code(text: string): string {
  const runs = text.match(/`+/g) ?? [];
  const fence = '`'.repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export const span = (start: number, end: number): Range => ({ start, end });
