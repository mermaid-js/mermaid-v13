/**
 * Measuring and placing XY chart text. Labels the author writes (the title, axis titles,
 * categories, legend names, point labels) go through core label layout (D385); tick numbers and
 * data labels are plain text, measured as one run. A placed text is v12's `TextElem`: an anchor
 * point, `text-anchor`, a baseline and a rotation, with its box from the measurer.
 */
import type { Size } from '@mermaid-js/core/layout';
import type { InlineSpans, Measurer } from '@mermaid-js/core/text';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { Point, Rect, XyBaseline, XyText, XyTextAnchor } from './types.ts';

/** A measured text: its size and the distance from its top to its first baseline. */
export interface Measured {
  readonly text: string;
  readonly font: FontKey;
  readonly width: number;
  readonly height: number;
  /** One line's height: `height` less it is what the label's extra lines add. */
  readonly lineHeight: number;
  readonly baseline: number;
  readonly label?: MeasuredLabel;
}

/** Measures through the render's measurer: labels by core label layout, plain text as is. */
export interface TextMeasure {
  label(text: string, font: FontKey): Measured;
  plain(text: string, font: FontKey): Measured;
  /** v12's `getMaxDimension`: the widest width and the tallest height of `texts`. */
  max(texts: readonly Measured[], font: FontKey): Size;
}

export function textMeasure(measurer: Measurer, inline: InlineSpans | undefined): TextMeasure {
  const options = inline ? { inline } : {};
  return {
    label(text, font) {
      const label = layoutLabel(text, font, Infinity, measurer, options);
      return {
        text,
        font,
        width: label.width,
        height: label.height,
        lineHeight: label.lineHeight,
        baseline: label.baseline,
        label,
      };
    },
    plain(text, font) {
      const { ascent, lineHeight } = measurer.metrics(font);
      return {
        text,
        font,
        width: measurer.width(text, font, 0),
        height: lineHeight,
        lineHeight,
        baseline: ascent,
      };
    },
    max(texts, font) {
      // v12 measured an empty list as zero wide and one line high (`textDimensionCalculator.ts`).
      if (texts.length === 0) return { width: 0, height: measurer.metrics(font).lineHeight };
      let width = 0;
      let height = 0;
      for (const t of texts) {
        width = Math.max(width, t.width);
        height = Math.max(height, t.height);
      }
      return { width, height };
    },
  };
}

/** How far left of the anchor a box starts, in box widths. */
const ANCHOR_SHIFT: Readonly<Record<XyTextAnchor, number>> = { start: 0, middle: 1 / 2, end: 1 };

/** `m` placed at `at` as v12 placed a `TextElem`. */
export function place(
  m: Measured,
  at: Point,
  anchor: XyTextAnchor,
  baseline: XyBaseline,
  rotation = 0
): XyText {
  let y = at.y;
  if (baseline === 'middle') y -= m.height / 2;
  else if (baseline === 'alphabetic') y -= m.baseline;
  const box: Rect = {
    x: at.x - ANCHOR_SHIFT[anchor] * m.width,
    y,
    width: m.width,
    height: m.height,
  };
  return {
    x: at.x,
    y: at.y,
    text: m.text,
    anchor,
    baseline,
    rotation,
    font: m.font,
    box,
    ...(m.label ? { label: m.label } : {}),
  };
}

/** The axis-aligned box around `t`'s box rotated about its anchor. */
export function textBounds(t: XyText): Rect {
  const { box } = t;
  if (t.rotation === 0) return box;
  const a = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [cx, cy] of [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x, box.y + box.height],
    [box.x + box.width, box.y + box.height],
  ] as const) {
    const dx = cx - t.x;
    const dy = cy - t.y;
    const x = t.x + dx * cos - dy * sin;
    const y = t.y + dx * sin + dy * cos;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
