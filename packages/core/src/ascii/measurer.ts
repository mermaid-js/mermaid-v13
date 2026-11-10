// cspell:words Grooff runewidth ZWSP Fullwidth FFFD
// The cell measurer: text width in terminal cells (DESIGN §6.3, D81, R-ASCII-7).
// Grapheme grouping follows mermaid-ascii's `textCells` (pkg/graph/draw.go at 5a9df15,
// https://github.com/AlexanderGrooff/mermaid-ascii, MIT, (c) 2023 Alexander Grooff), which
// keeps combining marks and ZWJ sequences with the character they modify. Changed: clusters
// come from `Intl.Segmenter` (UAX #29, so flags hold together) instead of a rune heuristic,
// and the width data is our own instead of go-runewidth.
import type { Measurer, VerticalMetrics } from '../text/measurer.ts';

/** One grapheme cluster and the cells it takes. */
export interface Grapheme {
  readonly text: string;
  readonly width: 0 | 1 | 2;
}

// Clusters made only of marks, controls and format characters (ZWJ, ZWSP, soft hyphen,
// variation selectors) take no cell.
const ZERO = /^[\p{M}\p{Cc}\p{Cf}]+$/u;
// Emoji presentation, a flag, or an emoji variation selector anywhere in the cluster.
const EMOJI = /\p{Emoji_Presentation}|\p{Regional_Indicator}|️/u;
// East Asian Wide and Fullwidth ranges, by the cluster's first code point.
const WIDE =
  /^[ᄀ-ᅟ〈〉⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏ꥠ-꥿가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦\u{16FE0}-\u{16FE4}\u{17000}-\u{18CFF}\u{1B000}-\u{1B2FF}\u{1F200}-\u{1F2FF}\u{20000}-\u{3FFFD}]/u;

let segmenter: Intl.Segmenter | undefined;

/** Width in cells of one grapheme cluster. */
export function graphemeWidth(cluster: string): 0 | 1 | 2 {
  if (ZERO.test(cluster)) return 0;
  return EMOJI.test(cluster) || WIDE.test(cluster) ? 2 : 1;
}

// Printable ASCII, box drawing and the ellipsis: each is a cluster of its own, one cell wide,
// unless a mark or joiner follows it, which this set leaves out. Most drawn text is only these.
const SIMPLE = /^[\x20-\x7e─-╿…]*$/;

/** `text` split into grapheme clusters with their widths. */
export function graphemes(text: string): Grapheme[] {
  // The segmenter's split, without the segmenter: drawn lines are mostly such text, and fast.
  if (SIMPLE.test(text)) return Array.from(text, (c) => ({ text: c, width: 1 as const }));
  // A fixed locale keeps the split the same on every host (R-ARCH-6).
  segmenter ??= new Intl.Segmenter('en', { granularity: 'grapheme' });
  const out: Grapheme[] = [];
  for (const { segment } of segmenter.segment(text)) {
    out.push({ text: segment, width: graphemeWidth(segment) });
  }
  return out;
}

/** Width of one line of text in cells. */
export function cellWidth(text: string): number {
  let width = 0;
  for (const g of graphemes(text)) width += g.width;
  return width;
}

const METRICS: VerticalMetrics = { ascent: 1, descent: 0, lineHeight: 1 };

/** Measures in cells, ignoring the font: each label line is one row. */
export const cellMeasurer: Measurer = {
  id: 'cell',
  width: (text) => cellWidth(text),
  metrics: () => METRICS,
};
