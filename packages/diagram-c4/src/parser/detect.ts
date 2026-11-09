/**
 * C4 detection on a raw source (D451): one of the five headers, word-bounded, at the start of the
 * text v12's detector saw (after the front matter, with directives and `%%` comments removed:
 * `diagramStart`). v12 anchored only `C4Context`, so any text mentioning another header was C4.
 * Exported for callers holding a raw source (conformance, editors).
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

export const C4_HEADER = /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/;

export function detectC4(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  const at = diagramStart(src, pre);
  // The longest header and the character after it.
  return C4_HEADER.test(src.slice(at, at + 13));
}
