/**
 * The timeline parser's public surface (so far): the lexer gated against v12's jison lexer.
 */
import { cook, Kind, sourceView } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';

export { JISON_NAMES, T as TimelineTokenKind } from './tokens.ts';

export interface TimelineToken {
  /** A `TimelineTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (entities, CRLF and removed spans applied). */
  text: string;
  range: Range;
}

/**
 * The significant timeline tokens of `src` (comments and directives left out), for editors
 * and for the lexer-parity gate.
 */
export function timelineTokens(src: string): TimelineToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const stream = lex(src, pre.bodyStart, view);
  const out: TimelineToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    if (kind === Kind.Comment || kind === Kind.Directive || kind === Kind.EOF) continue;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
