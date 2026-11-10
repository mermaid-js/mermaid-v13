// cspell:words requirementDiagramx
/**
 * Requirement detection on a raw source, as v12's detector saw the text
 * (`/^\s*requirement(Diagram)?/` after the front matter, with directives and `%%` comments
 * removed): `diagramStart` finds where that text starts. Case-sensitive, though the lexer is
 * not, and with no word boundary: `requirement` alone and `requirementDiagramx` are detected,
 * then rejected by the parser. For callers holding a raw source (conformance, editors).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectRequirement(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('requirement', diagramStart(src, pre));
}
