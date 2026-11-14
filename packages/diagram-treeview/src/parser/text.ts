/**
 * Small text helpers the box pass and the lexer share: v12's entity syntax and the growth of
 * parallel offset arrays.
 */
import { HASH, isWord, SEMI } from '@mermaid-js/core/parser-kit';

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

/** The parallel arrays `a` and `b`, each copied into a new one of `size`. */
export function grow<A extends Int32Array | Uint32Array>(a: A, b: A, size: number): [A, A] {
  const copy = (x: A) => {
    const y = new (x.constructor as new (n: number) => A)(size);
    y.set(x.subarray(0, Math.min(x.length, size)));
    return y;
  };
  return [copy(a), copy(b)];
}
