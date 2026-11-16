/**
 * The text v12's XY chart lexer saw: the shared v12 text (`v12Text` of
 * `@mermaid-js/shared/parser/v12-text`: comments cut, tag quotes converted, dropped `;` cut, CR
 * and CRLF read as LF, leading blanks trimmed, entities as v12's placeholders, the `\n` v12
 * appended), with the directives cut as v12's regex reads them ({@link v12Directives}) rather
 * than as core's preprocess locates them. Outside quotes no jison rule takes a placeholder's
 * first character, so it is a lexical error there. Every step is a linear scan (R-PARSE-7).
 */
import { COLON, isSpace, isWord, RBRACE } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { v12Text as sharedV12Text } from '@mermaid-js/shared/parser/v12-text';
import type { V12Text } from '@mermaid-js/shared/parser/v12-text';

const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/** v12's text for the body `src[from…]` (the text after the front matter). */
export function v12Text(src: string, from: number): V12Text {
  return sharedV12Text(src, from, v12Directives(src, from));
}

/**
 * The spans v12's directive regex removed from the body `src[from…]`, in order:
 * `%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?`, global.
 * Core's preprocess locates the same spans for well-formed directives, but not where v12's
 * regex reads text core does not: an unclosed `%%{` (core ends it at the end of its line; v12
 * ends it after a word argument and the blanks after that, line breaks too, or else runs it
 * to the end of the text), or a word argument followed by more text before `}%%` (v12 stops
 * after the word). A non-word argument runs over line breaks up to `}%%`, a U+2028 or U+2029,
 * or the end. Linear: the scan resumes after each span.
 */
function v12Directives(src: string, from: number): Range[] {
  const out: Range[] = [];
  for (let at = src.indexOf('%%{', from); at !== -1; ) {
    const nameStart = skipBlanks(src, at + 3);
    const nameEnd = skipWord(src, nameStart);
    if (nameEnd === nameStart) {
      at = src.indexOf('%%{', at + 1);
      continue;
    }
    const colon = skipBlanks(src, nameEnd);
    let i = skipBlanks(src, src.charCodeAt(colon) === COLON ? colon + 1 : nameEnd);
    const word = skipWord(src, i);
    if (word > i) i = word;
    else {
      for (let c = src.charCodeAt(i); i < src.length; c = src.charCodeAt(++i)) {
        if (c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR) break;
        if (c === RBRACE && src.startsWith('%%', i + 1)) break;
      }
    }
    i = skipBlanks(src, i);
    if (src.charCodeAt(i) === RBRACE && src.startsWith('%%', i + 1)) i += 3;
    out.push({ start: at, end: i });
    at = src.indexOf('%%{', i);
  }
  return out;
}

/** End of the run of `\s` from `i`. */
function skipBlanks(src: string, i: number): number {
  while (i < src.length && isSpace(src.charCodeAt(i))) i++;
  return i;
}

/** End of the run of `\w` from `i`. */
function skipWord(src: string, i: number): number {
  while (i < src.length && isWord(src.charCodeAt(i))) i++;
  return i;
}
