/**
 * Class-diagram detection, as v12's `classDetector-V2` saw the text (`/^\s*classDiagram/`):
 * after the front matter, with directives and `%%` comments removed. It matches
 * `classDiagram-v2` too (D101), and any word that starts with `classDiagram`, as v12 did.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

/** v12 diagram type of a class-diagram source, or undefined when it is not one. */
export function detectClass(
  src: string,
  pre: PreprocessResult = preprocess(src)
): 'classDiagram' | undefined {
  return src.startsWith('classDiagram', diagramStart(src, pre)) ? 'classDiagram' : undefined;
}
