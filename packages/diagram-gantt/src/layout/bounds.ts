/** A growing bounding box (D224: the SVG `viewBox` covers what is drawn). */
import type { PlacedText, Rect } from './types.ts';

export class Bounds {
  private x1 = Infinity;
  private y1 = Infinity;
  private x2 = -Infinity;
  private y2 = -Infinity;

  point(x: number, y: number): this {
    this.x1 = Math.min(this.x1, x);
    this.y1 = Math.min(this.y1, y);
    this.x2 = Math.max(this.x2, x);
    this.y2 = Math.max(this.y2, y);
    return this;
  }

  rect(r: Rect): this {
    return this.point(r.x, r.y).point(r.x + r.width, r.y + r.height);
  }

  /** A label's box from its anchor and first baseline. */
  text(p: PlacedText): this {
    const w = p.text.width;
    const shift = { start: 0, middle: w / 2, end: w }[p.anchor];
    return this.rect({ x: p.x - shift, y: p.y - p.text.baseline, width: w, height: p.text.height });
  }

  box(): Rect {
    return { x: this.x1, y: this.y1, width: this.x2 - this.x1, height: this.y2 - this.y1 };
  }
}
