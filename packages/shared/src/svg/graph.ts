/**
 * Drawing glue the graph diagrams share: the edge label as a tag and the text style a label is
 * measured with.
 */
import { type FontKey, fontSizePx, type MeasuredLabel, Style } from '@mermaid-js/core/text';
import type { Attrs, CheckedStyle, LabelBox, SvgWriter } from '@mermaid-js/core/svg';

/** An edge label's corner radius (D626). */
const TAG_RADIUS = 6;

/** What an edge label is painted with (D626–D628). */
export interface EdgeLabelPaint {
  /** The box's fill: the type's label-fill variable, `background` by default (D628). */
  readonly fill: Attrs['fill'];
  /** The edge's resolved stroke: the border's colour, never its width or dashes (D627). */
  readonly stroke: Attrs['stroke'];
  /** The text's attributes. */
  readonly text: Attrs;
  /** The profile's `labelPatch`: the room around the text, as the layout reserved it (D629). */
  readonly patch: { readonly x: number; readonly y: number };
}

/** Whether a label has nothing to show: no inline box and only whitespace. */
function blank(label: LabelBox): boolean {
  return label.lines.every((line) => line.every((s) => s.kind !== 'box' && !s.text.trim()));
}

/**
 * An edge label as a tag centred on `at` (D626): a `g.edgeLabel` (`data-id`) holding a box
 * with rounded corners, the label's size plus `paint.patch`, filled with `paint.fill` and
 * bordered 1 px solid in `paint.stroke`, then the text. The box is an outline of role `label`
 * (D630). A blank label draws nothing.
 */
export function edgeLabel(
  w: SvgWriter,
  label: LabelBox & { readonly width: number },
  at: { readonly x: number; readonly y: number },
  id: string,
  paint: EdgeLabelPaint
): void {
  if (blank(label)) return;
  const { fill, stroke, text, patch } = paint;
  const width = label.width + patch.x;
  const height = label.height + patch.y;
  w.open('g', { class: 'edgeLabel', 'data-id': id });
  w.outline('label', 'rect', {
    x: at.x - width / 2,
    y: at.y - height / 2,
    width,
    height,
    rx: TAG_RADIUS,
    fill,
    stroke,
    'stroke-width': 1,
  });
  w.label(label, at.x, at.y, text);
  w.close();
}

/** The bold and italic `Style` bits a checked style's text declarations ask for. */
export function emphasisBits(style: CheckedStyle): number {
  const t = style.text;
  const weight = t['font-weight'];
  const bold = weight === 'bold' || weight === 'bolder' || Number(weight) >= 600;
  return (bold ? Style.Bold : 0) | (t['font-style'] === 'italic' ? Style.Italic : 0);
}

/** Whether `label` has bold or italic text beyond what `style` asks for. */
export function addsEmphasis(label: MeasuredLabel, style: CheckedStyle): boolean {
  const mask = (Style.Bold | Style.Italic) & ~emphasisBits(style);
  return label.lines.some((line) => line.some((run) => (run.style & mask) !== 0));
}

/**
 * The font and `Style` bits a label is measured with under a checked style: its `font-size`
 * (above 0 and below 1000 px) over `font`'s, and its bold and italic bits.
 */
export function textStyle(style: CheckedStyle, font: FontKey): [FontKey, number] {
  const size = fontSizePx(style.text['font-size'], font.size);
  return [
    size !== undefined && size > 0 && size < 1000 ? { ...font, size } : font,
    emphasisBits(style),
  ];
}
