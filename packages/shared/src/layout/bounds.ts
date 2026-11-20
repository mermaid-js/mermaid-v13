/** The union of rectangles: what a custom layout's `bounds` are built from. */
import type { MeasuredLabel } from '@mermaid-js/core/text';

/** A rectangle by its top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A measured label and the box it is drawn in: the label's own size, at its place. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
}

/** The union of the rectangles added so far. */
export class RectUnion {
  private x0 = Infinity;
  private y0 = Infinity;
  private x1 = -Infinity;
  private y1 = -Infinity;
  add(r: Rect): void {
    this.x0 = Math.min(this.x0, r.x);
    this.y0 = Math.min(this.y0, r.y);
    this.x1 = Math.max(this.x1, r.x + r.width);
    this.y1 = Math.max(this.y1, r.y + r.height);
  }
  rect(): Rect {
    return { x: this.x0, y: this.y0, width: this.x1 - this.x0, height: this.y1 - this.y0 };
  }
}

/** The smallest rectangle holding every one of `rects`; a zero box at the origin for none. */
export function unionRects(rects: readonly Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const box = new RectUnion();
  for (const r of rects) box.add(r);
  return box.rect();
}
