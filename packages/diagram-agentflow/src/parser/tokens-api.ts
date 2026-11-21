import { preprocess } from '@mermaid-js/core/preprocess';
import { COMMENTS, cooked, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';
import { agentflowSourceView } from './source.ts';

/**
 * A token of this diagram: its `kind` is a `T` kind or a shared `Kind`, its `text` as v12's
 * lexer saw it (entities, CRLF and removed spans applied).
 */
export type AgentflowToken = SeenToken;

/**
 * The significant agentflow tokens of `src` (directives and the comments inside labels left
 * out; a `Comment` outside labels is significant; the list ends with the final `Kind.EOF`), for
 * editors and for the lexer-parity gate. Past `maxTextSize` v12 lexed the comment-free text, so
 * comments are trivia there.
 */
export function agentflowTokens(src: string, maxTextSize?: number): AgentflowToken[] {
  const pre = preprocess(src);
  const view = agentflowSourceView(
    src,
    pre.bodyStart,
    pre.directives.map((d) => d.range),
    maxTextSize
  );
  const stream = lex(src, pre.bodyStart, view);
  return keptTokens(stream, COMMENTS, cooked(src, stream, view), { eof: true });
}
