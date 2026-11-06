/**
 * Gantt detection, as v12's detector saw the text (`/^\s*gantt/` after the front matter, with
 * directives and `%%` comments removed): case-sensitive and with no word boundary, though the
 * lexer is case-insensitive.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectGantt(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('gantt', diagramStart(src, pre));
}
