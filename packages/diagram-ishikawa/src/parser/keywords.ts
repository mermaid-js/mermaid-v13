/**
 * The ishikawa header keywords: one source for the lexer, the parser's messages and the facet's
 * completions and rename check. The detector keeps v12's own pattern (`detect.ts`).
 */
import { isWord } from '@mermaid-js/core/parser-kit';

/** The header keywords, lower case, in the order completion offers them. */
export const KEYWORDS = ['ishikawa', 'ishikawa-beta'] as const;

/** Longest first, as in `ishikawa.jison`: the first literal that matches wins. */
const LONGEST_FIRST = [...KEYWORDS].sort((a, b) => b.length - a.length);

/** ASCII lower case of `c`, for case-insensitive literals. */
export const lower = (c: number): number => (c >= 65 && c <= 90 ? c + 32 : c);

/**
 * The length of the keyword at `text[at]` (`ishikawa-beta` or `ishikawa`, ASCII letters in any
 * case, then `\b`, as v12's lexer reads it), or 0. `end` is where the text ends.
 */
export function keywordAt(text: string, at: number, end = text.length): number {
  for (const word of LONGEST_FIRST) {
    const after = at + word.length;
    if (after > end || isWord(text.charCodeAt(after))) continue;
    let same = 0;
    while (same < word.length && lower(text.charCodeAt(at + same)) === word.charCodeAt(same))
      same++;
    if (same === word.length) return word.length;
  }
  return 0;
}

/** What to do with a line that starts with the keyword, which mermaid\@12 rejects. */
export const KEYWORD_REWORD = 'reword the line, as in `The ishikawa way`';
