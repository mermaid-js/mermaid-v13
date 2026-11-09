/** Token text as v12's parser read it. */
import type { XyChartLex } from './lexer.ts';

/** Undo v12's `encodeEntities` placeholders, as v12's renderer did (`decodeEntities`). */
const decodeEntities = (text: string): string =>
  text.replace(/ﬂ°°/g, '&#').replace(/ﬂ°/g, '&').replace(/¶ß/g, ';');

/**
 * The text of token `i` as v12's parser read it (less the `\n` v12 appended), or the source text
 * of a trivia token.
 */
export function tokenValue(l: XyChartLex, i: number): string {
  const s = l.textStart[i] ?? -1;
  if (s < 0) return l.tokens.source.slice(l.tokens.start[i] ?? 0, l.tokens.end[i] ?? 0);
  return decodeEntities(l.v12.text.slice(s, Math.min(l.textEnd[i] ?? s, l.v12.length)));
}
