/**
 * Pie detection, as v12's `pieDetector` saw the text (`/^\s*pie/`, case-sensitive): after the
 * front matter, with directives and `%%` comments removed. `pieChart` is detected too, and then
 * rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectPie(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('pie', diagramStart(src, pre));
}
