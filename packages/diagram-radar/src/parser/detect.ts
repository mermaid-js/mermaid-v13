// cspell:words betax
/**
 * Radar detection, as v12's detector saw the text (`/^\s*radar-beta/`, case-sensitive, no
 * boundary): after the front matter, with directives and `%%` comments removed. `radar-betax`
 * is detected too, and then rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectRadar(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('radar-beta', diagramStart(src, pre));
}
