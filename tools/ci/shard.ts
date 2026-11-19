/**
 * Splits test files into shards by measured duration (#984). Vitest's own `shard()` sorts the
 * files by a hash of their path and gives every shard the same number of files, however long
 * each one takes; this gives every shard about the same time instead. `duration-sequencer.ts`
 * applies it to a vitest run, with the durations in `test-durations.json`.
 */

/** A file to place, with the time it is planned to take. */
export interface Weighted {
  /** Unique among the items: it breaks ties, so every shard computes the same split. */
  readonly key: string;
  readonly ms: number;
}

/** The middle value, or 1 when there is none (an empty table plans every file alike). */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 1)
    : ((sorted[middle - 1] ?? 1) + (sorted[middle] ?? 1)) / 2;
}

/**
 * Longest first: each item, longest first (ties by key), joins the bin with the least time so
 * far (ties: the lowest index). The result depends only on the items' keys and times, not on
 * their order, so each shard of a run computes the same split and takes its own bin.
 */
export function balance<T extends Weighted>(items: readonly T[], count: number): T[][] {
  if (!Number.isInteger(count) || count < 1)
    throw new Error(`count must be a positive integer, not ${count}`);
  const bins: T[][] = Array.from({ length: count }, () => []);
  const totals: number[] = Array.from({ length: count }, () => 0);
  const order = [...items].sort((a, b) => b.ms - a.ms || (a.key < b.key ? -1 : 1));
  for (const item of order) {
    const lightest = totals.indexOf(Math.min(...totals));
    bins[lightest]?.push(item);
    totals[lightest] = (totals[lightest] ?? 0) + item.ms;
  }
  return bins;
}
