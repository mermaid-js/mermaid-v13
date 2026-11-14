/** Token text as v12's parser read it. */
import { decodePlaceholders } from '@mermaid-js/core/parser-kit/support';
import type { QuadrantLex } from './lexer.ts';

/**
 * The text of token `i` as v12's lexer read it, with its entity placeholders (less the `\n` v12
 * appended), or the source text of a trivia token.
 */
export function tokenText(l: QuadrantLex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length));
}

/** The text of token `i` as v12's parser read it: {@link tokenText}, placeholders decoded. */
export const tokenValue = (l: QuadrantLex, i: number): string =>
  decodePlaceholders(tokenText(l, i));
