// cspell:words betax
/**
 * Wardley detection, as v12's detector saw the text (`/^\s*wardley-beta/i`, no boundary): after
 * the front matter, with directives and `%%` comments removed. The test ignores case and the
 * grammar does not, so `Wardley-Beta` and `wardley-betax` are detected and then rejected by the
 * parser, as in v12.
 */
import { LOWER_A } from '@mermaid-js/core/parser-kit';
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

const HEADER = 'wardley-beta';
const LOWER_Z = 0x7a;
/** Lower case minus upper case, for ASCII letters. */
const CASE_BIT = 0x20;

export function detectWardley(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  const at = diagramStart(src, pre);
  for (let i = 0; i < HEADER.length; i++) {
    const c = src.charCodeAt(at + i);
    const h = HEADER.charCodeAt(i);
    // ASCII letters either case, as `/i` without `u` matches them.
    if (c !== h && !(h >= LOWER_A && h <= LOWER_Z && c === h - CASE_BIT)) return false;
  }
  return true;
}
