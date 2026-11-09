// cspell:words eventmodeling
/**
 * Event modeling detection, as v12's detector saw the text (`/^\s*eventmodeling/`, no boundary,
 * case-sensitive): after the front matter, with directives and `%%` comments removed. So
 * `eventmodelingX` and `eventmodeling-beta` are detected and then rejected by the parser, as in
 * v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectEventModeling(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('eventmodeling', diagramStart(src, pre));
}
