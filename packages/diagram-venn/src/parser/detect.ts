// cspell:words vennx
/**
 * Venn detection on a raw source, as v12's detector saw the text (`/^\s*venn-beta/` after the
 * front matter, with directives and `%%` comments removed): `diagramStart` finds where that text
 * starts. Case-sensitive, though the lexer is not, and with no word boundary: `venn-betax` is
 * detected, then rejected by the parser.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectVenn(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('venn-beta', diagramStart(src, pre));
}
