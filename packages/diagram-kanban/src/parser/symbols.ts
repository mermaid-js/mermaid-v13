/**
 * Where the kanban parser's symbol occurrences are in the source (D289, #463): the words of a
 * `:::` line in a line cut by removed spans, and an `assigned` value written plainly in shape
 * data. Each search stays within the token or block it looks in, so a parse stays linear.
 */
import type { Range, SourceView } from '@mermaid-js/core/parser-kit';

/** The blanks the model splits a `:::` line at (HTML class-attribute words). */
const CLASS_BLANK = /[\t\n\f\r ]/;
/** A plain key and its `:` where a pair starts in shape data (after `@{`, a `,` or a line break). */
const PAIR_START = /(?:^|[{,\n\r])[\t ]*([A-Za-z]+)[\t ]*:[\t ]*/g;
/** What ends a plain value in a flow mapping (one-line data), and in block pairs. */
const FLOW_VALUE_END = /[,}\n\r]/;
const BLOCK_VALUE_END = /[\n\r]/;

/** The removed spans of `view` that overlap `r`, found by binary search (in source order). */
export function holesIn(view: SourceView, r: Range): readonly Range[] {
  const { holes } = view;
  let lo = 0;
  let hi = holes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((holes[mid]?.end ?? 0) <= r.start) lo = mid + 1;
    else hi = mid;
  }
  let end = lo;
  while (end < holes.length && (holes[end]?.start ?? 0) < r.end) end++;
  return holes.slice(lo, end);
}

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
 * The range of `key`'s value in the shape data of `src` at `data` (from `@{` to `}`), written
 * plainly as `<key>: <name>` (or `"<name>"`, `'<name>'`, quotes included) in the only pair
 * that names `key`; undefined when it is not written so (the caller reads the YAML tree).
 */
export function writtenValue(
  src: string,
  key: string,
  name: string,
  data: Range
): Range | undefined {
  const inner = src.slice(data.start + 2, data.end - 1);
  const block = BLOCK_VALUE_END.test(inner);
  // One such pair only: a second (in a quoted value, or a repeated key) is the tree's to sort.
  let from = -1;
  for (const m of inner.matchAll(PAIR_START)) {
    if (m[1] !== key) continue;
    if (from >= 0) return undefined;
    from = data.start + 2 + m.index + m[0].length;
  }
  if (from < 0) return undefined;
  const end = data.end - 1;
  const quote = src.charAt(from);
  if (quote === '"' || quote === "'") {
    const close = from + 1 + name.length;
    return close < end && src.charAt(close) === quote && src.startsWith(name, from + 1)
      ? { start: from, end: close + 1 }
      : undefined;
  }
  let to = from;
  while (to < end && !(block ? BLOCK_VALUE_END : FLOW_VALUE_END).test(src.charAt(to))) to++;
  while (to > from && /[\t ]/.test(src.charAt(to - 1))) to--;
  return src.slice(from, to) === name ? { start: from, end: to } : undefined;
}
