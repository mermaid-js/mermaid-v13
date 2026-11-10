import { cook, Kind } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { preprocess } from '@mermaid-js/core/preprocess';
import { lex } from './lexer.ts';
import { agentflowSourceView } from './source.ts';

export interface AgentflowToken {
  /** A `T` kind or a shared `Kind`. */
  kind: number;
  /** The token's text as v12's lexer saw it (entities, CRLF and removed spans applied). */
  text: string;
  range: Range;
}

/**
 * The significant agentflow tokens of `src` (directives and the comments inside labels left
 * out; a `Comment` outside labels is significant), for editors and for the lexer-parity gate.
 * Past `maxTextSize` v12 lexed the comment-free text, so comments are trivia there.
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
  const out: AgentflowToken[] = [];
  for (let j = 0; j < stream.length; j++) {
    const kind = stream.kind[j] ?? Kind.EOF;
    if (kind === Kind.Comment || kind === Kind.Directive) continue;
    const start = stream.start[j] ?? 0;
    const end = stream.end[j] ?? 0;
    out.push({ kind, text: cook(src, start, end, view), range: { start, end } });
  }
  return out;
}
