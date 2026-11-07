// cspell:words infox
/**
 * Info detection, as v12's `infoDetector` saw the text (`/^\s*info/`, case-sensitive): after
 * the front matter, with directives and `%%` comments removed. `infox` is detected too, and
 * then rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectInfo(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('info', diagramStart(src, pre));
}
