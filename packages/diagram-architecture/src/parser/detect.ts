// cspell:words betax
/**
 * Architecture detection, as v12's detector saw the text (`/^\s*architecture/`, case-sensitive,
 * no boundary): after the front matter, with directives and `%%` comments removed. A bare
 * `architecture` or `architecture-betax` is detected too, and then rejected by the parser, as in
 * v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectArchitecture(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('architecture', diagramStart(src, pre));
}
