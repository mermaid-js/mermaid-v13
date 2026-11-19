// The router's A* search over its pipe grid (#843): where a point sits among the pipes, which
// steps a node box blocks, and which point the search takes next. Each answers what the code it
// replaces answered, on the same numbers, with less work.

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

/** An entry of the search's open list: a grid point, by key, with its estimated cost `f`. */
export interface OpenEntry<P> {
  key: string;
  f: number;
  pt: P;
}

interface Placed<P> {
  entry: OpenEntry<P>;
  /** `f` when the entry took its place in `sorted`. */
  placedF: number;
  /** In `pushed`, in `sorted` as placed, or in `sorted` with `f` changed since. */
  state: 'pushed' | 'sorted' | 'changed';
  /** Its index in `sorted` while `changed`. */
  at: number;
}

/**
 * The search's open list. `shift` takes the entry a stable sort of the list by `f` puts first, so
 * a tie goes to the entry earlier in the list; `setF` leaves a changed entry where it is, and
 * `push` appends. The list is kept in that sorted order, and a `shift` moves only the entries
 * pushed or changed since the one before. Keys must be unique within the list, as the router's
 * open set keeps them.
 */
export class OpenList<P> {
  /** The list as the last `shift` left it, sorted by `placedF`; changed entries still in place. */
  private readonly sorted: Placed<P>[] = [];
  private readonly pushed: Placed<P>[] = [];
  private readonly changed: Placed<P>[] = [];
  private readonly byKey = new Map<string, Placed<P>>();

  get length(): number {
    return this.sorted.length + this.pushed.length;
  }

  push(entry: OpenEntry<P>): void {
    const placed: Placed<P> = { entry, placedF: entry.f, state: 'pushed', at: -1 };
    this.pushed.push(placed);
    this.byKey.set(entry.key, placed);
  }

  /** Sets the `f` of the entry with `key`, if the list holds one. */
  setF(key: string, f: number): void {
    const placed = this.byKey.get(key);
    if (!placed) {
      return;
    }
    if (placed.state === 'sorted') {
      placed.at = this.indexOf(placed);
      placed.state = 'changed';
      this.changed.push(placed);
    }
    placed.entry.f = f;
  }

  /** The entry the stable sort by `f` puts first, removed from the list. */
  shift(): OpenEntry<P> | undefined {
    if (this.changed.length > 0 || this.pushed.length > 0) {
      this.settle();
    }
    const first = this.sorted.shift();
    if (first) {
      this.byKey.delete(first.entry.key);
    }
    return first?.entry;
  }

  /** Where `placed` sits in `sorted`: among the entries placed with its `placedF`. */
  private indexOf(placed: Placed<P>): number {
    const { sorted } = this;
    let low = 0;
    let high = sorted.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (sorted[mid]!.placedF - placed.placedF < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    while (sorted[low] !== placed) {
      low++;
    }
    return low;
  }

  /** Sorts as the router's sort did: by `f`, then by place in the list as it stood. */
  private settle(): void {
    const { sorted } = this;
    const removed = this.changed.map((placed) => placed.at).sort((a, b) => a - b);
    const moving = [
      ...this.changed.map((placed) => ({ placed, at: placed.at })),
      ...this.pushed.map((placed, i) => ({ placed, at: sorted.length + i })),
    ].sort((a, b) => a.placed.entry.f - b.placed.entry.f || a.at - b.at);
    for (let i = removed.length - 1; i >= 0; i--) {
      sorted.splice(removed[i]!, 1);
    }
    /** The index in the list as it stood of `sorted[j]`, past the removed entries before it. */
    const standingIndex = (j: number): number => {
      let skipped = 0;
      for (const r of removed) {
        if (r > j + skipped) {
          break;
        }
        skipped++;
      }
      return j + skipped;
    };
    const places = moving.map(({ placed, at }) => {
      let low = 0;
      let high = sorted.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        const order = sorted[mid]!.entry.f - placed.entry.f;
        if (order < 0 || (order === 0 && standingIndex(mid) < at)) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      return low;
    });
    for (let i = moving.length - 1; i >= 0; i--) {
      const { placed } = moving[i]!;
      placed.placedF = placed.entry.f;
      placed.state = 'sorted';
      sorted.splice(places[i]!, 0, placed);
    }
    this.changed.length = 0;
    this.pushed.length = 0;
  }
}
