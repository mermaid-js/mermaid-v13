/**
 * Cynefin detection, as v12's `cynefinDetector` saw the text (`/^\s*cynefin-beta(?:[\s:]|$)/`,
 * case-sensitive): after the front matter, with directives and `%%` comments removed. A
 * directive inside the header is cut out of it, as v12 cut it. v12 removed a comment with the
 * line break after it (`/\s*%%.*\n/gm`) and put a line break back, so `cynefin-beta%% c` on a
 * line of its own is detected too.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

const HEADER = 'cynefin-beta';
/** The header and the two characters after it decide. */
const NEEDED = HEADER.length + 2;

export function detectCynefin(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  let at = diagramStart(src, pre);
  let text = '';
  for (const { range } of pre.directives) {
    if (range.end <= at) continue;
    if (text.length + range.start - at >= NEEDED) break;
    text += src.slice(at, range.start);
    at = range.end;
  }
  text += src.slice(at, at + NEEDED);
  if (!text.startsWith(HEADER)) return false;
  const c = text.charAt(HEADER.length);
  if (c === '' || c === ':' || /\s/.test(c)) return true;
  return text.startsWith('%%', HEADER.length) && src.includes('\n', at);
}
