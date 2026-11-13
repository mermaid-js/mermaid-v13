/** Token text as v12's parser read it. */
import { entityAt } from '@mermaid-js/core/text';
import type { QuadrantLex } from './lexer.ts';

/**
 * Undo v12's `encodeEntities` placeholders, as v12's renderer did (`decodeEntities`). A name
 * core cannot decode goes back to `#name;`, as written (D559).
 */
const decodeEntities = (text: string): string =>
  text
    .replace(/ﬂ°(?!°)(\w+)¶ß/g, (all, name: string) =>
      entityAt(`&${name};`, 0) ? all : `#${name};`
    )
    .replace(/ﬂ°°/g, '&#')
    .replace(/ﬂ°/g, '&')
    .replace(/¶ß/g, ';');

/**
 * The text of token `i` as v12's parser read it (less the `\n` v12 appended), or the source
 * text of a trivia token.
 */
export function tokenValue(l: QuadrantLex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return decodeEntities(l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length)));
}
