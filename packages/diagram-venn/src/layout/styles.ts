/**
 * The venn styles merged by target (v12 `buildStyleByKey`): every `style` statement naming the
 * same targets adds its properties in source order, a later value replacing an earlier one.
 * One namespace serves sets, overlaps and text nodes, as in v12: the key of `style A` is the
 * key of set `A` and of a text node `A`.
 */
import type { VennModel } from '../model.ts';
import { areaKey } from '../solver/index.ts';

export { areaKey };

/** The merged properties of each style target, by `areaKey(targets)`. */
export function vennStyles(model: VennModel): Map<string, Readonly<Record<string, string>>> {
  const map = new Map<string, Record<string, string>>();
  for (const { targets, properties } of model.styles) {
    const key = areaKey(targets);
    const existing = map.get(key);
    if (existing) Object.assign(existing, properties);
    else map.set(key, Object.assign(Object.create(null) as Record<string, string>, properties));
  }
  return map;
}
