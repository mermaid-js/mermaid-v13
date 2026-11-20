import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import { COMMENTS, keptTokens } from '@mermaid-js/shared/parser/seen-tokens';
import type { SeenToken } from '@mermaid-js/shared/parser/seen-tokens';
import { lex } from './lexer.ts';

/** A token of this diagram: its `kind` is a `T` kind or a shared `Kind`. */
export type ErToken = SeenToken;

/**
 * The significant ER tokens of `src` (comments, directives and the final `Kind.EOF` left out),
 * for editors and for the lexer-parity gate.
 */
export function erTokens(src: string): ErToken[] {
  const { tokens, textStart, textEnd, view } = lex(src);
  return keptTokens(tokens, COMMENTS, (j) =>
    decodePlaceholders(view.text.slice(textStart[j], textEnd[j]))
  );
}
