// cspell:words betax ishikawas
/**
 * Ishikawa detection on a raw source, as v12's detector saw the text
 * (`/^\s*ishikawa(-beta)?\b/i` after the front matter, with directives and `%%` comments
 * removed): `diagramStart` finds where that text starts. Case-insensitive, with a word boundary:
 * `ishikawas` is not detected; `ishikawa-betax` is (`ishikawa`, then a boundary before `-`).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

const HEADER = /ishikawa(?:-beta)?\b/iy;

export function detectIshikawa(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  HEADER.lastIndex = diagramStart(src, pre);
  return HEADER.test(src);
}
