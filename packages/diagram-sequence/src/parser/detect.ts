/**
 * Sequence detection, as v12's detector saw the text (`/^\s*sequenceDiagram/` after the front
 * matter, with directives and `%%` comments removed).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectSequence(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('sequenceDiagram', diagramStart(src, pre));
}
