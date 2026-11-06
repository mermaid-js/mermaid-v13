// cspell:words bdklrs
/**
 * The icons a mindmap draws outside its labels (`DiagramPlugin.icons`, D293): every node's
 * `::icon(…)`, as the glyph name the icons plugin looks up (D297).
 */
import type { MindmapModel } from './model.ts';

/** `<pack> <x>-<name>`: two words on one line. */
const PACK_AND_CLASS = /^(\S+)[ \t]+([^\s-]+)-(\S+)$/;
/** Font Awesome's pack names, whose icon classes are `fa-<name>` (core's D296 prefixes). */
const FONT_AWESOME = /^fa[bdklrs]?$/;

/**
 * The glyph name of an `::icon(…)` reference (D297): `mdi:fire` as written; `<pack> <x>-<name>`
 * as `<pack>:<name>` when `<x>` is the pack (`mdi mdi-fire`) or `fa` after a Font Awesome pack
 * (`fa fa-book`, `fab fa-github`); any other reference trimmed, as written (it resolves to no
 * glyph and is shown as written).
 */
export function mindmapIconName(reference: string): string {
  const text = reference.trim();
  const m = PACK_AND_CLASS.exec(text);
  if (!m) return text;
  const [, pack = '', prefix, name = ''] = m;
  return prefix === pack || (prefix === 'fa' && FONT_AWESOME.test(pack)) ? `${pack}:${name}` : text;
}

/** Every node's icon, in source order, as {@link mindmapIconName} names it. */
export function mindmapIcons(model: MindmapModel): readonly string[] {
  return model.nodes.flatMap((n) => (n.icon ? [mindmapIconName(n.icon.text)] : []));
}
