/**
 * Drawing glue the graph diagrams share: the edge label on its background box and the
 * text style a label is measured with.
 */
import { type FontKey, fontSizePx, Style } from '@mermaid-js/core/text';
import type { Attrs, CheckedStyle, LabelBox, SvgWriter } from '@mermaid-js/core/svg';

// Room each side of an edge label inside its background box.
const LABEL_PAD = 4;

/**
 * v12's edge label centred on `at`: a `g.edgeLabel` (`data-id`), the background box `fill`ed
 * (its corners rounded by `rx`), then the text with `text`'s attributes.
 */
export function edgeLabel(
  w: SvgWriter,
  label: LabelBox & { readonly width: number },
  at: { readonly x: number; readonly y: number },
  id: string,
  fill: Attrs['fill'],
  text: Attrs,
  rx?: number
): void {
  const lw = label.width + 2 * LABEL_PAD;
  w.open('g', { class: 'edgeLabel', 'data-id': id });
  w.leaf('rect', {
    x: at.x - lw / 2,
    y: at.y - label.height / 2,
    width: lw,
    height: label.height,
    rx,
    fill,
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
