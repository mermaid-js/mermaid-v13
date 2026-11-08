// cspell:words sankeyx
/**
 * Sankey detection on a raw source, as v12's detector saw the text (`/^\s*sankey(-beta)?/` after
 * the front matter, with directives and `%%` comments removed): `diagramStart` finds where that
 * text starts. Case-sensitive, though the lexer is not, and with no word boundary: `sankeyx` is
 * detected, then rejected by the parser. For callers holding a raw source (conformance,
 * editors); the plugin's `detector` (T5) gets the preprocessed text and tests v12's pattern on
 * it directly.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectSankey(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('sankey', diagramStart(src, pre));
}
