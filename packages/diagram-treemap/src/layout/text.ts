/**
 * Treemap text, measured by the injected measurer in the font it is drawn in (pitfall 16), with
 * v12's fitting rules (`renderer.ts:240-292`, `:381-523`) in place of `getComputedTextLength()`.
 *
 * Labels follow the label rule (#1368): read by core's handler (`readLabel`), so tags draw, a
 * written `\n` breaks the line and a markdown string is markdown, as every label is under
 * `markdownAlwaysOn`. A label that reads as one line
 * of text in one style is measured, truncated and drawn as one string, as before (D405); any
 * other is laid out by core's label layout and fitted as one block of lines and runs.
 */
import {
  decodeEntities,
  fontSizePx,
  layoutLabel,
  Style,
  type FontKey,
  type InlineSpans,
  type LabelSource,
  type MeasuredLabel,
  type Measurer,
  type Run,
} from '@mermaid-js/core/text';
import { readLabel, type MarkdownWarningContext } from '@mermaid-js/core/text/markdown-warning';
import { BOLD_WEIGHT, MAX_WEIGHT, NORMAL_WEIGHT } from './metrics.ts';
import type { Rect, TreemapText, TreemapTextAnchor } from './types.ts';

/** CSS weights for a `font-weight` value; undefined for what is not one. */
function weightOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase();
  if (v === 'bold' || v === 'bolder') return BOLD_WEIGHT;
  if (v === 'normal' || v === 'lighter') return NORMAL_WEIGHT;
  const n = /^\d+$/.test(v) ? Number(v) : Number.NaN;
  return n >= 1 && n <= MAX_WEIGHT ? n : undefined;
}

/**
 * The font a class's styles draw text in, from `base`: v12 wrote a class's text properties
 * after its own `font-size` (`styles2String`'s label styles), so a class `font-size`,
 * `font-weight` or `font-family` wins. Each style is `key: value`, the last of a key counts.
 */
export function classFont(styles: readonly string[], base: FontKey): FontKey {
  const map = new Map<string, string | undefined>();
  for (const style of styles) {
    const [key, value] = style.split(':');
    map.set(key!.trim(), value?.trim());
  }
  const size = fontSizePx(map.get('font-size'), base.size);
  const family = map.get('font-family');
  return {
    family: family ? family : base.family,
    size: size !== undefined && size > 0 ? size : base.size,
    weight: weightOf(map.get('font-weight')) ?? base.weight,
  };
}

/** Width of `text` in `font` through the measurer. */
export function textWidth(measurer: Measurer, text: string, font: FontKey): number {
  return text === '' ? 0 : measurer.width(text, font, font.weight >= BOLD_WEIGHT ? Style.Bold : 0);
}

const ELLIPSIS = '...';

/**
 * v12's header truncation (`:262-292`): the whole text if it fits `space`; else the longest
 * start of it that fits with `...` after it; else `...` alone; else nothing. v12 dropped one
 * character at a time; a start's width grows with its length, so a binary search finds the same
 * cut in O(n log n) (pitfall 19). Characters are code points (v12 cut UTF-16 units, which
 * could split an emoji).
 */
export function truncate(measurer: Measurer, text: string, font: FontKey, space: number): string {
  if (textWidth(measurer, text, font) <= space) return text;
  const chars = [...text];
  const cut = (n: number): string => chars.slice(0, n).join('') + ELLIPSIS;
  // The longest n in [1, length) whose cut fits, or 0.
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(measurer, cut(mid), font) <= space) lo = mid;
    else hi = mid - 1;
  }
  if (lo > 0) return cut(lo);
  return textWidth(measurer, ELLIPSIS, font) <= space ? ELLIPSIS : '';
}

/** The style bits every run of a label in `font` starts from. */
const baseStyle = (font: FontKey): number => (font.weight >= BOLD_WEIGHT ? Style.Bold : 0);

/** A label as written, read by the label rule (#1368). */
export interface TreemapLabelText {
  /** Set when the label is one line of text in one style: that text, entities decoded. */
  readonly line?: string;
  /** The label for core's label layout. */
  readonly source: LabelSource;
  /** The render's inline-box providers (icons, math), for core's label layout. */
  readonly inline?: InlineSpans;
}

/**
 * Reads a label through core's handler, which warns once per render about markdown in a plain
 * label (`MARKDOWN_NOT_READ`): `written` as the model holds it, `markdown` when the parser marked
 * it as a markdown string (its backticks are still on it). Under `markdownAlwaysOn` every label
 * is markdown, so none takes the one-line path.
 */
export function readTreemapLabel(
  written: string,
  markdown: boolean,
  ctx: MarkdownWarningContext,
  font: FontKey,
  measurer: Measurer
): TreemapLabelText {
  const source = readLabel(markdown ? written.slice(1, -1) : written, { markdown }, ctx);
  const read = ctx.inline ? { source, inline: ctx.inline } : { source };
  if (source.markup !== 'plain') return read;
  const decoded = decodeEntities(written);
  const { lines } = blockOf(read, font, measurer);
  const only = lines.length === 1 && lines[0]!.length === 1 ? lines[0]![0]! : undefined;
  const one =
    lines.length === 0
      ? decoded.trim() === ''
      : only !== undefined && only.style === baseStyle(font) && only.text === decoded.trim();
  return one && !lines.some((line) => line.some((run) => run.kind === 'box'))
    ? { ...read, line: decoded }
    : read;
}

/** A label's lines and runs in `font`, broken only where it is written to break. */
export function blockOf(label: TreemapLabelText, font: FontKey, measurer: Measurer): MeasuredLabel {
  const { source, inline } = label;
  return layoutLabel(source.text, font, Infinity, measurer, {
    ...source,
    style: baseStyle(font),
    ...(inline ? { inline } : {}),
  });
}

/**
 * `runs` cut as {@link truncate} cuts a string: the longest start (in code points, across runs)
 * that fits `space` with `...` after it, the dots in the style of the character before them;
 * else `...` alone; else undefined. `more` says lines follow that are cut off, so the dots are
 * added even when the whole line fits.
 */
function cutRuns(
  runs: readonly Run[],
  font: FontKey,
  measurer: Measurer,
  space: number,
  more: boolean
): Run[] | undefined {
  const chars = runs.flatMap((run, r) => [...run.text].map((c) => ({ c, r })));
  const cut = (n: number): Run[] => {
    const out: Run[] = [];
    for (let i = 0; i < n; i++) {
      const { c, r } = chars[i]!;
      const last = out[out.length - 1];
      if (last && chars[i - 1]!.r === r) out[out.length - 1] = { ...last, text: last.text + c };
      else out.push({ ...runs[r]!, text: c });
    }
    const end = out[out.length - 1];
    if (end) out[out.length - 1] = { ...end, text: end.text + ELLIPSIS };
    else out.push({ ...runs[0]!, text: ELLIPSIS });
    return out.map((run) => ({ ...run, width: measurer.width(run.text, font, run.style) }));
  };
  const width = (line: readonly Run[]): number => line.reduce((sum, run) => sum + run.width, 0);
  let lo = 0;
  let hi = more ? chars.length : chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (width(cut(mid)) <= space) lo = mid;
    else hi = mid - 1;
  }
  const line = cut(lo);
  return lo > 0 || width(line) <= space ? line : undefined;
}

/**
 * A laid-out label truncated to `space` (#1368): each line wider than `space` is cut as
 * {@link cutRuns} cuts it. Under `oneLine` (a section header, one line high) only the first line
 * is kept, with `...` after it when more lines followed. Undefined when a line keeps nothing.
 */
export function truncateBlock(
  label: MeasuredLabel,
  font: FontKey,
  measurer: Measurer,
  space: number,
  oneLine: boolean
): MeasuredLabel | undefined {
  const kept = oneLine ? label.lines.slice(0, 1) : label.lines;
  const more = kept.length < label.lines.length;
  if (!more && label.width <= space) return label;
  const lines: Run[][] = [];
  const widths: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const runs = kept[i]!;
    const last = more && i === kept.length - 1;
    const fits = !last && label.widths[i]! <= space;
    const line = fits ? runs : cutRuns(runs, font, measurer, space, last);
    if (line === undefined) return undefined;
    lines.push(line);
    widths.push(fits ? label.widths[i]! : line.reduce((sum, run) => sum + run.width, 0));
  }
  return {
    lines,
    widths,
    indents: lines.map(() => 0),
    width: Math.max(0, ...widths),
    height: lines.length * label.lineHeight,
    lineHeight: label.lineHeight,
    baseline: label.baseline,
  };
}

/** How far left of its point a text's box starts, in text widths. */
const ANCHOR_SHIFT: Readonly<Record<TreemapTextAnchor, number>> = {
  start: 0,
  middle: 1 / 2,
  end: 1,
};

/** Where a text goes: its point, and how it is anchored and aligned on it. */
export interface TextAt {
  readonly x: number;
  readonly y: number;
  readonly anchor: TreemapTextAnchor;
  readonly baseline: 'middle' | 'hanging';
}

/** One line at (`x`, `y`): its box from the anchor, the baseline and the font size. */
export function placed(text: string, font: FontKey, measurer: Measurer, at: TextAt): TreemapText {
  const width = textWidth(measurer, text, font);
  const shift = ANCHOR_SHIFT[at.anchor] * width;
  const top = at.baseline === 'middle' ? at.y - font.size / 2 : at.y;
  return { text, font, ...at, box: { x: at.x - shift, y: top, width, height: font.size } };
}

/**
 * A laid-out label (#1368) placed as {@link placed} places a line, its block's middle on `y`; a
 * `start`-anchored one is drawn left-aligned. `text` is its lines' text, one per line.
 */
export function placedBlock(label: MeasuredLabel, font: FontKey, at: TextAt): TreemapText {
  const box: Rect = {
    x: at.x - ANCHOR_SHIFT[at.anchor] * label.width,
    y: at.y - label.height / 2,
    width: label.width,
    height: label.height,
  };
  return {
    text: label.lines.map((line) => line.map((run) => run.text).join('')).join('\n'),
    font,
    ...at,
    box,
    block: at.anchor === 'start' ? { ...label, left: true } : label,
  };
}
