// Block counts for placing labels on C4's text grid (#689): how many marked cells each block of
// a region holds, read from a summed-area table. A label's places overlap, so testing each by
// scanning its cells costs the label's size squared; the table costs the region once.
import type { CellRect } from '@mermaid-js/core/ascii';

export class BlockCounts {
  private readonly sums: Int32Array;
  private readonly stride: number;

  /** Counts the cells of `region` that `marked` holds. */
  constructor(
    private readonly region: CellRect,
    marked: (x: number, y: number) => boolean
  ) {
    const { x, y, width, height } = region;
    this.stride = width + 1;
    this.sums = new Int32Array(this.stride * (height + 1));
    for (let j = 0; j < height; j++) {
      let row = 0;
      const at = (j + 1) * this.stride + 1;
      for (let i = 0; i < width; i++) {
        if (marked(x + i, y + j)) row++;
        this.sums[at + i] = this.sums[at + i - this.stride]! + row;
      }
    }
  }

  /** The marked cells among the `w` × `h` from (x, y), a block inside the region. */
  count(x: number, y: number, w: number, h: number): number {
    const { sums, stride } = this;
    const a = (y - this.region.y) * stride + (x - this.region.x);
    const b = a + h * stride;
    return sums[b + w]! - sums[b]! - sums[a + w]! + sums[a]!;
  }
}
