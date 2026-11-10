/**
 * The icons an architecture diagram draws outside its labels (`DiagramPlugin.icons`, D293, D505):
 * every service's and group's icon with a pack prefix (`logos:aws`), as written, once each in
 * source order. The seven built-ins are the package's own and need no extension; any other
 * name without a prefix draws v12's `?` square.
 */
import type { ArchitectureModel } from './model.ts';
import { isPackIcon } from './render/assets.ts';

export function architectureIcons(model: ArchitectureModel): readonly string[] {
  const names = new Set<string>();
  for (const item of [...model.groups, ...model.services])
    if (item.icon !== undefined && isPackIcon(item.icon)) names.add(item.icon);
  return [...names];
}

/** Every text the layout and renderer hand to core's label layout (D176, D178). */
export function architectureLabels(model: ArchitectureModel): readonly string[] {
  const out: string[] = [];
  for (const g of model.groups) if (g.title !== undefined) out.push(g.title);
  for (const s of model.services) {
    if (s.title !== undefined) out.push(s.title);
    if (s.iconText !== undefined) out.push(s.iconText);
  }
  for (const e of model.edges) if (e.title !== undefined) out.push(e.title);
  return out;
}
