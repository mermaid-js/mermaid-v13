/**
 * Rows (v12 `draw`): one per task in source order, or with `displayMode: compact` v12's
 * `getMaxIntersections` per section name, which packs a section's tasks into the fewest lanes.
 * Section names are visited in v12's object-key order: integer-like names first, ascending.
 */
import type { ScheduledTask } from '../schedule/index.ts';

/** A resolved, non-`vert` task with its row. */
export interface Rowed {
  readonly task: ScheduledTask;
  readonly row: number;
}

export interface Rows {
  readonly count: number;
  /** Row of each task by index into the schedule; undefined for `vert` and unplaced tasks. */
  readonly of: ReadonlyMap<number, number>;
  /** Rows each section name takes, in v12's `Object.keys(categoryHeights)` order. */
  readonly sections: readonly (readonly [name: string, rows: number])[];
}

/** An array index key (`"0"` … `"4294967294"`), which a JS object lists first, ascending. */
const RE_INDEX = /^(?:0|[1-9]\d*)$/;
const MAX_INDEX = 2 ** 32 - 2;
const isIndex = (k: string): boolean => RE_INDEX.test(k) && Number(k) <= MAX_INDEX;

/** The keys of a JS object filled in `keys` order, as `Object.keys` lists them. */
export function objectKeyOrder(keys: Iterable<string>): string[] {
  const seen = [...new Set(keys)];
  const indexes = seen.filter(isIndex).sort((a, b) => Number(a) - Number(b));
  return [...indexes, ...seen.filter((k) => !isIndex(k))];
}

const resolved = (t: ScheduledTask): boolean => t.start !== undefined && t.end !== undefined;

export function rowsOf(
  tasks: readonly ScheduledTask[],
  names: readonly string[],
  compact: boolean
): Rows {
  const plain = tasks.filter((t) => !t.task.tags.includes('vert'));
  const of = new Map<number, number>();
  if (!compact) {
    for (const t of plain) of.set(t.index, t.order);
    const counts = new Map<string, number>();
    for (const t of plain) counts.set(names[t.index]!, (counts.get(names[t.index]!) ?? 0) + 1);
    return {
      count: plain.length,
      of,
      sections: objectKeyOrder(counts.keys()).map((k) => [k, counts.get(k)!] as const),
    };
  }
  const groups = new Map<string, ScheduledTask[]>();
  for (const t of plain) {
    if (!resolved(t)) continue;
    const list = groups.get(names[t.index]!) ?? [];
    list.push(t);
    groups.set(names[t.index]!, list);
  }
  const sections: [string, number][] = [];
  let offset = 0;
  for (const name of objectKeyOrder(groups.keys())) {
    const lanes = maxIntersections(groups.get(name)!, offset, of) + 1;
    sections.push([name, lanes]);
    offset += lanes;
  }
  return { count: offset, of, sections };
}

/** v12 `getMaxIntersections`: greedy first free lane, by start then source order. */
function maxIntersections(
  tasks: readonly ScheduledTask[],
  offset: number,
  of: Map<number, number>
): number {
  const lanes: number[] = [];
  const sorted = [...tasks].sort((a, b) => a.start! - b.start! || a.order - b.order);
  let max = 0;
  for (const t of sorted) {
    let lane = lanes.findIndex((end) => t.start! >= end);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = t.end!;
    of.set(t.index, lane + offset);
    if (lane > max) max = lane;
  }
  return max;
}
