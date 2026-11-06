// cspell:words kanbanx
/**
 * Kanban detection, as v12's detector saw the text (`/^\s*kanban/` after the front matter, with
 * directives and `%%` comments removed). Case-sensitive, though the lexer is not, and with no
 * word boundary: `kanbanx` is detected, then rejected by the parser.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectKanban(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('kanban', diagramStart(src, pre));
}
