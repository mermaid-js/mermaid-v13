/**
 * Timeline detection, as v12's detector saw the text (`/^\s*timeline/` after the front matter,
 * with directives and `%%` comments removed). Case-sensitive, though the lexer is not.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectTimeline(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('timeline', diagramStart(src, pre));
}
