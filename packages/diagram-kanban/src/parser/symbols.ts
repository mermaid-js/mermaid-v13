/**
 * Where the kanban parser's symbol occurrences are in the source (D289, #463): the words of a
 * `:::` line in a line cut by removed spans, and an offset of the data text v12 read (CRLFs and
 * CRs as LFs) in the source. Each search stays within the token or block it looks in, so a
 * parse stays linear.
 */
import { CR, LF } from '@mermaid-js/core/parser-kit';
import type { Range } from '@mermaid-js/core/parser-kit';
import { CLASS_BLANK } from './text.ts';

/**
 * The first offset of `src` at or after `from` in `within` where `word` stands as a word of its
 * own (blanks, a removed span or `within`'s ends around it) outside the removed spans
 * (`holes`, those in `within`), or -1.
 */
export function wordIn(
  src: string,
  word: string,
  from: number,
  within: Range,
  holes: readonly Range[]
): number {
  // Searched in the token's own text, so each lookup costs the token's length at most.
  const token = src.slice(within.start, within.end);
  const edge = (at: number, side: number) =>
    at === (side < 0 ? within.start : within.end) ||
    CLASS_BLANK.test(src.charAt(side < 0 ? at - 1 : at)) ||
    holes.some((h) => (side < 0 ? h.end : h.start) === at);
  for (let k = token.indexOf(word, from - within.start); k >= 0; k = token.indexOf(word, k + 1)) {
    const at = within.start + k;
    const end = at + word.length;
    if (holes.some((h) => h.start < end && at < h.end)) continue;
    if (edge(at, -1) && edge(end, 1)) return at;
  }
  return -1;
}

/**
 * The source offset of offset `k` of `text`, the data text v12 read for the source data
 * `src[from, to)`: the same text with each CRLF and lone CR read as an LF. -1 when `text`
 * differs from the source otherwise before `k` (an entity, a removed comment or directive, a
 * line break read as `<br/>` in a quoted run), or `k` is past it.
 */
export function sourceOffset(
  src: string,
  from: number,
  to: number,
  text: string,
  k: number
): number {
  let i = 0;
  let j = from;
  while (i < k) {
    if (j >= to) return -1;
    const t = text.charCodeAt(i);
    const s = src.charCodeAt(j);
    if (t === s) {
      i++;
      j++;
    } else if (s === CR && t === LF) {
      // A CRLF's CR is dropped; a lone CR is the LF.
      if (src.charCodeAt(j + 1) === LF) j++;
      else {
        i++;
        j++;
      }
    } else return -1;
  }
  return j;
}
