/**
 * The icons an architecture diagram draws outside its labels (`DiagramPlugin.icons`, D293, D505):
 * every group's and service's icon but the seven built-ins, as written, once each in source
 * order, with v12's fallback pack (`mermaid-architecture`), so the icons extension splits and
 * loads each as v12 resolved it (`logos:aws` and `logos-aws` from `logos`).
 */
import type { DiagramIcon } from '@mermaid-js/core';
import type { ArchitectureModel } from './model.ts';
import { BUILTIN_PACK, isBuiltinIcon } from './render/assets.ts';

export function architectureIcons(model: ArchitectureModel): readonly DiagramIcon[] {
  const names = new Set<string>();
  for (const item of [...model.groups, ...model.services])
    if (item.icon !== undefined && !isBuiltinIcon(item.icon)) names.add(item.icon);
  return [...names].map((name) => ({ name, fallbackPrefix: BUILTIN_PACK }));
}

/** Every text the layout and renderer hand to core's label layout (D176, D178). */
export function architectureLabels(model: ArchitectureModel): readonly string[] {
  const out: string[] = [];
  for (const g of model.groups) if (g.title !== undefined) out.push(g.title);
  for (const s of model.services) {
    if (s.title !== undefined) out.push(s.title);
    if (s.iconText) out.push(s.iconText);
  }
  for (const e of model.edges) if (e.title !== undefined) out.push(e.title);
  return out;
}
