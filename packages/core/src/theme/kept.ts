/**
 * What a theme derives, kept by the objects it is derived from (spec, dark spec, tables) and,
 * under those, by the value of its overrides (TH4): `''` for no overrides, which stays, and a few
 * other values, the oldest dropped first. Values are keys made by `dataKey`, never objects, so
 * overrides changed in place are read again.
 */
export type KeptLevel<T> = WeakMap<object, KeptLevel<T> | Map<string, T>>;

/** How many sets of overrides one leaf keeps besides the plain parts. */
const VALUED = 8;

/** The leaf of `path` under `root`, made on the way down. */
export function keptLeaf<T>(root: KeptLevel<T>, path: readonly object[]): Map<string, T> {
  let level = root;
  const last = path.length - 1;
  for (let i = 0; i < last; i++) {
    let next = level.get(path[i]!) as KeptLevel<T> | undefined;
    if (!next) level.set(path[i]!, (next = new WeakMap()));
    level = next;
  }
  let leaf = level.get(path[last]!) as Map<string, T> | undefined;
  if (!leaf) level.set(path[last]!, (leaf = new Map()));
  return leaf;
}

/** The value kept for `key`, made the newest; or `make()`, kept. */
export function kept<T>(leaf: Map<string, T>, key: string, make: () => T): [T, boolean] {
  let value = leaf.get(key);
  const hit = value !== undefined;
  if (hit) leaf.delete(key);
  else {
    value = make();
    if (leaf.size > VALUED) leaf.delete([...leaf.keys()].find(Boolean)!);
  }
  leaf.set(key, value!);
  return [value!, hit];
}
