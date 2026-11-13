/**
 * Small text helpers the box pass and the lexer share: v12's entity syntax and the growth of
 * parallel offset arrays.
 */
import { HASH, isWord, SEMI } from '@mermaid-js/core/parser-kit';
import { entityAt as decodedAt } from '@mermaid-js/core/text';

/**
 * The end (after the `;`) of the entity `#\w+;` at `i`, or -1. v12's `encodeEntities` turned
 * each into a placeholder (`ﬂ°name¶ß`, `ﬂ°°123¶ß` for a number) before its parser ran, and its
 * renderer turned that into `&name;` (`&#123;`).
 */
export function entityAt(text: string, i: number): number {
  if (text.charCodeAt(i) !== HASH) return -1;
  let j = i + 1;
  while (j < text.length && isWord(text.charCodeAt(j))) j++;
  return j > i + 1 && text.charCodeAt(j) === SEMI ? j + 1 : -1;
}

/** Whether the entity `text[i, end)` names a number (`#123;`). */
export function numericEntity(text: string, i: number, end: number): boolean {
  return /^\d+$/.test(text.slice(i + 1, end - 1));
}

/**
 * `text` with each entity `#name;` / `#123;` written `&name;` / `&#123;`: how v12's renderer
 * read the placeholders its parser saw. A name core cannot decode stays `#name;` (D559). This is
 * the parser kit's `cook` for the box pass's rewritten lines, which are not a source range. It
 * is not core's `decodeEntities` and stays: the model keeps v12's `&name;` text, and the layout
 * and the text output decode that (D561).
 */
export function ampEntities(text: string): string {
  if (!text.includes('#')) return text;
  let out = '';
  let from = 0;
  for (let i = text.indexOf('#'); i !== -1; i = text.indexOf('#', Math.max(i + 1, from))) {
    const end = entityAt(text, i);
    if (end < 0) continue;
    const ref = (numericEntity(text, i, end) ? '&#' : '&') + text.slice(i + 1, end);
    if (ref[1] !== '#' && !decodedAt(ref, 0)) continue;
    out += text.slice(from, i) + ref;
    from = end;
  }
  return out + text.slice(from);
}

/** The parallel arrays `a` and `b`, each copied into a new one of `size`. */
export function grow<A extends Int32Array | Uint32Array>(a: A, b: A, size: number): [A, A] {
  const copy = (x: A) => {
    const y = new (x.constructor as new (n: number) => A)(size);
    y.set(x.subarray(0, Math.min(x.length, size)));
    return y;
  };
  return [copy(a), copy(b)];
}
