import type { VennModel } from './model.ts';

/**
 * Every text the venn layout hands to core's label layout (D176, D178), as written: the title,
 * each set's and overlap's label (a set's own id when it has none) and each text node's label or
 * id.
 */
export function vennLabels(model: VennModel): readonly string[] {
  const out: string[] = [];
  if (model.title !== undefined) out.push(model.title);
  for (const s of model.subsets) {
    if (s.label !== undefined) out.push(s.label);
    else if (s.sets.length === 1) out.push(s.sets[0]!);
  }
  for (const t of model.textNodes) out.push(t.label ?? t.id);
  return out;
}
