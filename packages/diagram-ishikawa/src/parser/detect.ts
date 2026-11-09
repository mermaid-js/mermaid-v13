// cspell:words betax ishikawas
/**
 * Ishikawa detection on a raw source, as v12's detector saw the text
 * (`/^\s*ishikawa(-beta)?\b/i` after the front matter, with directives and `%%` comments
 * removed): `diagramStart` finds where that text starts. Case-insensitive, with a word boundary:
 * `ishikawas` is not detected; `ishikawa-betax` is (`ishikawa`, then a boundary before `-`).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** v12's pattern at the diagram start; no `g` or `y` flag, so it keeps no state between calls. */
const HEADER = /^ishikawa(?:-beta)?\b/i;

/** `ishikawa-beta` and the character `\b` looks at after it. */
const HEADER_SPAN = 'ishikawa-beta'.length + 1;

export function detectIshikawa(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  const at = diagramStart(src, pre);
  return HEADER.test(src.slice(at, at + HEADER_SPAN));
}
