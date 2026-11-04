/**
 * The sequence parser's public surface. For now: the lexer, gated against v12's jison lexer.
 */
import { Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import { cook, sourceView } from './source.ts';

export { JISON_NAMES, T as SequenceTokenKind } from './tokens.ts';

export interface SequenceToken {
  /** A `SequenceTokenKind` or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's parser read it (entities, CRLF and removed spans applied). */
  text: string;
  range: Range;
}

/**
 * The significant sequence tokens of `src` (comments and directives left out), for editors
 * and for the lexer-parity gate.
 */
export function sequenceTokens(src: string): SequenceToken[] {
  const pre = preprocess(src);
  const view = sourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const stream = lex(src, pre.bodyStart, view);
  const out: SequenceToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    if (kind === Kind.Comment || kind === Kind.Directive || kind === Kind.EOF) continue;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
