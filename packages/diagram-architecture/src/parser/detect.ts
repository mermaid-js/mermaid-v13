// cspell:words betax
/**
 * Architecture detection, as v12's detector saw the text (`/^\s*architecture/`, case-sensitive,
 * no boundary): after the front matter, with directives and `%%` comments removed. A directive
 * inside the header is cut out of it, as v12 cut it (`archi%%{init: {}}%%tecture-beta` is
 * detected, and parsed). A bare `architecture` or `architecture-betax` is detected too, and then
 * rejected by the parser, as in v12.
 */
import { diagramStart, preprocess } from '@mermaid-js/core/preprocess';
import type { PreprocessResult } from '@mermaid-js/core/preprocess';

const HEADER = 'architecture';

export function detectArchitecture(src: string, pre: PreprocessResult = preprocess(src)): boolean {
  let at = diagramStart(src, pre);
  let text = '';
  for (const { range } of pre.directives) {
    if (range.end <= at) continue;
    if (text.length + range.start - at >= HEADER.length) break;
    text += src.slice(at, range.start);
    at = range.end;
  }
  text += src.slice(at, at + HEADER.length);
  return text.startsWith(HEADER);
}
