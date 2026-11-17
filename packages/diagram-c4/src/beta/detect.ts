/**
 * c4-beta detection on a raw source (spec #730 §Detection): the `c4-beta` header, not followed by
 * a word character or a hyphen, where the diagram starts (after front matter, with directives and
 * comments skipped: `diagramStart`). It is the pattern of the `c4beta` row of the detector table
 * (`tools/gen-config/src/registry.ts`), and it is disjoint from {@link detectC4}'s: a C4 header
 * starts with a capital `C`, so no text is both.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

const C4_BETA_HEADER = /^c4-beta(?![\w-])/;

/** The longest text the header and the character after it can span. */
const HEADER_SPAN = 'c4-beta'.length + 1;

export function detectC4Beta(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  const at = diagramStart(src, pre);
  return C4_BETA_HEADER.test(src.slice(at, at + HEADER_SPAN));
}
