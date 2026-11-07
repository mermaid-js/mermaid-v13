// cspell:words kanbanx
/**
 * Kanban detection on a raw source, as v12's detector saw the text (`/^\s*kanban/` after the
 * front matter, with directives and `%%` comments removed): `diagramStart` finds where that text
 * starts. Case-sensitive, though the lexer is not, and with no word boundary: `kanbanx` is
 * detected, then rejected by the parser. Exported from the main and `./language` entries for
 * callers holding a raw source (conformance, editors); the plugin's `detector` (`plugin.ts`)
 * gets the preprocessed text and tests v12's pattern on it directly.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export function detectKanban(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  return src.startsWith('kanban', diagramStart(src, pre));
}
