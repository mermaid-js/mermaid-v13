// The router's A* search over its pipe grid (#843): where a point sits among the pipes. It
// answers what the scan it replaces answered, on the same numbers, reading fewer pipes.

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
