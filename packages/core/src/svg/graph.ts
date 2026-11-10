/**
 * Drawing glue the graph diagrams share: sanitised class lists and the edge label on its
 * background box.
 */
import { fontSizePx } from '../text/fonts.ts';
import { Style, type FontKey } from '../text/measurer.ts';
import { checkStyle, type CheckedStyle } from './style.ts';
import type { Attrs, Warn } from './types.ts';
import type { LabelBox, SvgWriter } from './writer.ts';

/** Author class names as a class-attribute tail: each cut to `[\w-]`, with a leading space. */
export function classNames(names: readonly string[]): string {
  let out = '';
  for (const n of names) {
    const c = n.replace(/[^\w-]/g, '');
    if (c) out += ' ' + c;
  }
  return out;
}

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

/**
 * The checked style of class names plus own declarations, checked once per distinct list:
 * `defs` holds each class's declarations, `warn` takes what `checkStyle` drops.
 */
export function classStyles(
  defs: ReadonlyMap<string, readonly string[]>,
  warn: Warn
): (classes: readonly string[], own?: readonly string[]) => CheckedStyle {
  const styles = new Map<string, CheckedStyle>();
  return (classes, own = []) => {
    const decls: string[] = [];
    for (const name of classes) for (const s of defs.get(name) ?? []) decls.push(s.trim());
    for (const s of own) decls.push(s.trim());
    const key = decls.join(';');
    let style = styles.get(key);
    if (!style) styles.set(key, (style = checkStyle(decls, warn)));
    return style;
  };
}
