// cspell:words blockchain
/**
 * Block detection on a raw source, as v12's detector saw the text (`/^\s*block(-beta)?/` after
 * the front matter, with directives and `%%` comments removed): `diagramStart` finds where that
 * text starts. Case-sensitive and with no word boundary: `blockchain` is detected, then
 * rejected by the parser. For callers holding a raw source (conformance, editors); a plugin
 * `detector` gets the preprocessed text and tests v12's pattern on it directly.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectBlock(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('block', diagramStart(src, pre));
}
