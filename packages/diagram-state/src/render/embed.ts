// Embedded diagram blocks (ADR-15): the frame, the line under the title strip, the title, and
// the inner diagram's own <svg> spliced in at its natural size.
import { translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import { EMBED_PAD, titleStrip } from '../layout/embed.ts';
import type { StateNodeView } from '../layout/index.ts';

/** Draws block `view` centred on (0, 0): `frame` paints its border, `text` its title. */
export function drawEmbed(w: SvgWriter, view: StateNodeView, frame: Attrs, text: Attrs): void {
  const { w: width, h: height } = view;
  const top = -height / 2;
  w.outline('node', 'rect', { x: -width / 2, y: top, width, height, ...frame });
  const s = titleStrip(view.label.height);
  if (s > 0) {
    w.outline('divider', 'line', {
      x1: -width / 2,
      y1: top + s,
      x2: width / 2,
      y2: top + s,
      stroke: frame.stroke,
      'stroke-width': frame['stroke-width'],
    });
    w.label(view.label, 0, top + s / 2, text);
  }
  const slot = view.embed;
  if (!slot) return;
  w.open('g', { class: 'embedded', transform: translate(-slot.width / 2, top + s + EMBED_PAD) });
  w.embed(slot.svg);
  w.close();
}
