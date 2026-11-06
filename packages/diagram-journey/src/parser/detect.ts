/**
 * Journey detection, as v12's `journeyDetector` saw the text (`/^\s*journey/`, case-sensitive,
 * no word boundary): after the front matter, with directives and `%%` comments removed.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectJourney(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('journey', diagramStart(src, pre));
}
