/**
 * Where the diagram text starts, as v12's detectors saw it: after the front matter, with
 * directives and `%%` comments removed.
 */
import { isSpace } from '../parser-kit/chars.ts';
import type { PreprocessResult } from './preprocess.ts';

/** Skip whitespace and `%%` comments (not `%%{`, which starts a directive). */
function skipTrivia(src: string, from: number): number {
  let i = from;
  for (;;) {
    while (isSpace(src.charCodeAt(i))) i++;
    if (!src.startsWith('%%', i) || src[i + 2] === '{') return i;
    const eol = src.indexOf('\n', i);
    if (eol === -1) return src.length;
    i = eol;
  }
}

/** Offset of the diagram keyword: after front matter, directives, `%%` comments and whitespace. */
export function diagramStart(src: string, pre: PreprocessResult): number {
  let i = skipTrivia(src, pre.bodyStart);
  for (const { range } of pre.directives) {
    if (range.end <= i) continue;
    if (range.start > i) break;
    i = skipTrivia(src, range.end);
  }
  return i;
}
