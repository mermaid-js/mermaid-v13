// cspell:words Graphx
/**
 * gitGraph detection, as v12's detector saw the text (`/^\s*gitGraph/`, case-sensitive): after
 * the front matter, with directives and `%%` comments removed. `gitGraphx` is detected too, and
 * then rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectGitGraph(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('gitGraph', diagramStart(src, pre));
}
