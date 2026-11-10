/**
 * Drawing glue the graph diagrams share: sanitised class lists and the edge label on its
 * background box.
 */
import type { Attrs } from './types.ts';
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
