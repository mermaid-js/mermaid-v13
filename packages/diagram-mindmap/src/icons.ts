/**
 * The icons a mindmap draws outside its labels (`DiagramPlugin.icons`, D293): every node's
 * `::icon(…)`, as the glyph name the icons plugin looks up (D297).
 */
import type { MindmapModel } from './model.ts';

/** `<pack> <x>-<name>` (`fa fa-book`, `mdi mdi-fire`): the second word's prefix is dropped. */
const PACK_AND_CLASS = /^(\S+)\s+[^\s-]*-(\S+)$/;

/**
 * The glyph name of an `::icon(…)` reference (D297): `mdi:fire` as written, `fa fa-book` as
 * `fa:book`; any other reference trimmed, as written (it resolves to no glyph and is shown as
 * written).
 */
export function mindmapIconName(reference: string): string {
  const text = reference.trim();
  const m = PACK_AND_CLASS.exec(text);
  return m ? `${m[1]}:${m[2]}` : text;
}

/** Every node's icon, in source order, as {@link mindmapIconName} names it. */
export function mindmapIcons(model: MindmapModel): readonly string[] {
  return model.nodes.flatMap((n) => (n.icon ? [mindmapIconName(n.icon.text)] : []));
}
