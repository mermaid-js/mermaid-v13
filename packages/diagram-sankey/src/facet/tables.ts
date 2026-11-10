/**
 * Helpers the sankey completion and hover share: token lookup, the row a token is on, and
 * Markdown code spans.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range, TokenStream } from '@mermaid-js/core/parser-kit';
import { fieldName } from '../parser/names.ts';
import { SankeyKind as T } from '../parser/tokens.ts';
import { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { tokenBefore } from '@mermaid-js/core/parser-kit/facet';
export { span } from '@mermaid-js/core/parser-kit/facet';
export { code } from '@mermaid-js/core/parser-kit/facet';

const LINE_BREAK = /[\n\r]/;

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
  return fieldName(raw);
}
