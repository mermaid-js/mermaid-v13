import { preprocess } from '@mermaid-js/core/preprocess';
import { COMMENTS, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { flowSourceView, lex } from './lexer.ts';

/**
 * A token of this diagram: its `kind` is a `T` kind or a shared `Kind`, its `text` as v12's
 * lexer saw it (entities, CRLF and removed spans applied).
 */
export type FlowToken = SeenToken;

/**
 * The significant flowchart tokens of `src` (comments and directives left out; the list ends
 * with the final `Kind.EOF`), for editors and for the lexer-parity gate.
 */
export function flowchartTokens(src: string): FlowToken[] {
  const pre = preprocess(src);
  const view = flowSourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range)
  );
  const stream = lex(src, pre.bodyStart, view);
  return keptTokens(stream, COMMENTS, cooked(src, stream, view), { eof: true });
}
