/**
 * Folding ranges (DESIGN §4.5): every statement span that covers more than one line
 * (subgraphs, multi-line `accDescr { }`, a chain with a multi-line `@{ }`), at any depth,
 * plus the front matter and multi-line directives. Ranges are offsets; adapters turn them
 * into line ranges.
 */
import type { Range, StatementSpan } from '@mermaid-js/core/parser-kit';
import type { DocumentContext } from './context.ts';

export interface FoldingRange {
  range: Range;
  /** The statement kind (`subgraph`, `accDescr`, `chain`, …), `frontMatter` or `directive`. */
  kind: string;
}

const LINE_BREAK = /[\r\n]/;

export function foldingRanges(ctx: DocumentContext): FoldingRange[] {
  const { text, pre } = ctx;
  const out: FoldingRange[] = [];
  const add = (kind: string, range: Range) => {
    // Without its trailing line break, so the fold ends on the range's last line.
    let end = range.end;
    while (end > range.start && LINE_BREAK.test(text.charAt(end - 1))) end--;
    if (LINE_BREAK.test(text.slice(range.start, end))) out.push({ kind, range: { ...range, end } });
  };
  if (pre.frontMatter) add('frontMatter', pre.frontMatter.range);
  for (const d of pre.directives) add('directive', d.range);
  const walk = (spans: readonly StatementSpan[]) => {
    for (const s of spans) {
      add(s.kind, s.range);
      if (s.children) walk(s.children);
    }
  };
  if (ctx.result) walk(ctx.result.statements);
  return out.sort((a, b) => a.range.start - b.range.start || b.range.end - a.range.end);
}
