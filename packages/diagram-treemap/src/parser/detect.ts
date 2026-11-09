// cspell:words treemapx betax
/**
 * Treemap detection, as v12's detector saw the text (`/^\s*treemap/`, case-sensitive, no
 * boundary): after the front matter, with directives and `%%` comments removed. `treemap-beta`
 * is detected, and so are `treemapx` and `treemap-betax`, which the parser then rejects, as in
 * v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectTreemap(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('treemap', diagramStart(src, pre));
}
