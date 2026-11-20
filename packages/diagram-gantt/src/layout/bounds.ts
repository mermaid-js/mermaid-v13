/** A growing bounding box (D224: the SVG `viewBox` covers what is drawn). */
import { RectUnion } from '@mermaid-js/shared/layout';
import type { PlacedText } from './types.ts';

export class Bounds extends RectUnion {
  point(x: number, y: number): this {
    this.add({ x, y, width: 0, height: 0 });
    return this;
  }

  /** A label's box from its anchor and first baseline. */
  text(p: PlacedText): void {
    const w = p.text.width;
    const shift = { start: 0, middle: w / 2, end: w }[p.anchor];
    this.add({ x: p.x - shift, y: p.y - p.text.baseline, width: w, height: p.text.height });
  }
}
