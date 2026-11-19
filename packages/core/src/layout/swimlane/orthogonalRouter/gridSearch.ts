// The router's A* search over its pipe grid (#843): where a point sits among the pipes, and
// which steps a node box blocks. Each answers what the scan it replaces answered, on the same
// numbers, reading fewer pipes and boxes.

/** A pipe as the search reads it: the line it runs on. */
export interface PipeLine {
  coord: number;
}

/**
 * The index of the first of `sorted` within 1 of `at`, as
 * `sorted.findIndex((p) => Math.abs(p.coord - at) < 1)` finds it, or -1. `sorted` must be in
 * ascending `coord` order, and stay so between lookups: the pipes before the answer are all 1 or
 * more below `at`, so a binary search for the first not that far below finds it.
 */
export function firstPipeNear(sorted: readonly PipeLine[], at: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sorted[mid]!.coord - at > -1) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low < sorted.length && Math.abs(sorted[low]!.coord - at) < 1 ? low : -1;
}

/** A node box the router keeps routes out of, grown by its padding. */
export interface ObstacleBox {
  nodeId: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * The boxes by the lines that run through them, for the search's step test: a step along a line
 * meets only the boxes that line runs through. Each line's boxes are found once, in box order.
 */
export class ObstacleLines {
  private readonly boxes: readonly ObstacleBox[];
  private readonly rows = new Map<number, ObstacleBox[]>();
  private readonly columns = new Map<number, ObstacleBox[]>();

  constructor(boxes: readonly ObstacleBox[]) {
    this.boxes = boxes;
  }

  /** The boxes with `minY < y < maxY`. */
  private row(y: number): ObstacleBox[] {
    let boxes = this.rows.get(y);
    if (!boxes) {
      boxes = this.boxes.filter((box) => box.minY < y && box.maxY > y);
      this.rows.set(y, boxes);
    }
    return boxes;
  }

  /** The boxes with `minX < x < maxX`. */
  private column(x: number): ObstacleBox[] {
    let boxes = this.columns.get(x);
    if (!boxes) {
      boxes = this.boxes.filter((box) => box.minX < x && box.maxX > x);
      this.columns.set(x, boxes);
    }
    return boxes;
  }

  /**
   * Whether a box other than those of `start` and `end` blocks the step from (`x`, `y`) that
   * spans `minX .. maxX` and `minY .. maxY`: along the row `y` when `minX !== maxX`, else along
   * the column `x`. Both ends are open, so a step that only touches a box is not blocked.
   */
  blocksStep(
    x: number,
    y: number,
    [minX, maxX, minY, maxY]: readonly [number, number, number, number],
    start: string | undefined,
    end: string | undefined
  ): boolean {
    if (minX !== maxX) {
      return this.row(y).some(
        (box) => box.nodeId !== start && box.nodeId !== end && box.maxX > minX && box.minX < maxX
      );
    }
    return this.column(x).some(
      (box) => box.nodeId !== start && box.nodeId !== end && box.maxY > minY && box.minY < maxY
    );
  }
}
