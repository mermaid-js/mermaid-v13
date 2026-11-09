/**
 * The venn styles merged by target (v12 `buildStyleByKey`): every `style` statement naming the
 * same targets adds its properties in source order, a later value replacing an earlier one.
 * One namespace serves sets, overlaps and text nodes, as in v12: the key of `style A` is the
 * key of set `A` and of a text node `A`. The layout hands each drawn area and text node its
 * merged style, which the renderer paints from.
 */
import { idsKey, nullRecord, type VennModel } from '../model.ts';

/** The merged properties of each style target, by `idsKey(targets)`. */
export function vennStyles(model: VennModel): Map<string, Readonly<Record<string, string>>> {
  const map = new Map<string, Record<string, string>>();
  for (const { targets, properties } of model.styles) {
    const key = idsKey(targets);
    const existing = map.get(key);
    if (existing) Object.assign(existing, properties);
    else map.set(key, Object.assign(nullRecord<string>(), properties));
  }
  return map;
}
