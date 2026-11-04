/**
 * ER detection, as v12's `erDetector` saw the text (`/^\s*erDiagram/`, case-sensitive): after
 * the front matter, with directives and `%%` comments removed.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectEr(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('erDiagram', diagramStart(src, pre));
}
