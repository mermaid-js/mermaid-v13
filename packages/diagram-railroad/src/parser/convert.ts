/**
 * Value conversion as v12 ran it (parser-method §3): each notation's Langium value converter
 * (`packages/parser/src/language/railroad{,-ebnf,-abnf,-peg}/valueConverter.ts`) on top of
 * `common/valueConverter.ts` for `title`, `accTitle` and `accDescr`, then the railroad DB's
 * setters. Every input is a token's text as v12's lexer read it (`cook()`ed). The common values
 * (`accTitle`, `accDescr`, the one-line title) are `@mermaid-js/shared/parser/common-values`.
 */
export { accDescrValue, accTitleValue } from '@mermaid-js/shared/parser/common-values';
import { oneLine, unquote } from '@mermaid-js/shared/parser/common-values';
import type { RailroadNotation } from './tokens.ts';

/** v12's escapes in IR, EBNF and PEG strings: these three; any other `\c` is `c`. */
const ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t' };

/**
 * v12's `decodeEscapedString`: the text between the quotes of `image`, with `\n`, `\r` and `\t`
 * decoded and any other `\c` read as `c`. A `\` that is the last character inside the quotes
 * stays.
 */
export function decodeEscaped(image: string): string {
  return unquote(image, ESCAPES, true);
}

/** A quoted string's value: decoded in IR, EBNF and PEG; the text between the quotes in ABNF. */
export function stringValue(notation: RailroadNotation, image: string): string {
  return notation === 'railroadAbnf' ? image.slice(1, -1) : decodeEscaped(image);
}

/** An EBNF special sequence `? … ?`: the text between the `?`s, trimmed. */
export function specialValue(image: string): string {
  return image.slice(1, -1).trim();
}

/** Whether `text` starts and ends with the same quote (`"` alone counts, as in v12). */
function quoted(text: string): boolean {
  const q = text[0];
  return (q === '"' || q === "'") && text.endsWith(q);
}

/**
 * `title …`: the text after the keyword, trimmed, blank runs as one space; then, when it is
 * quoted, without its quotes, decoded in IR, EBNF and PEG (sliced in ABNF).
 */
export function titleValue(notation: RailroadNotation, image: string): string {
  const value = oneLine(image.slice(image.indexOf('title') + 5));
  if (!quoted(value)) return value;
  return stringValue(notation, value);
}

/** ABNF's `parseRepeat`: `n*m` (an empty `n` is 0, an empty `m` unbounded), or exactly `n`. */
export function repeatBounds(text: string): { min: number; max: number } {
  const star = text.indexOf('*');
  if (star < 0) {
    const n = Number.parseInt(text, 10);
    return { min: n, max: n };
  }
  const lo = text.slice(0, star);
  const hi = text.slice(star + 1);
  return {
    min: lo ? Number.parseInt(lo, 10) : 0,
    max: hi ? Number.parseInt(hi, 10) : Infinity,
  };
}
