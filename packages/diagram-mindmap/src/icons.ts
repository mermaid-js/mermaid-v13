// cspell:words bdklrs
/**
 * The icons a mindmap draws outside its labels (`DiagramPlugin.icons`, D293): every node's
 * `::icon(…)`, as the glyph name the icons plugin looks up (D297).
 */
import type { MindmapModel } from './model.ts';

/** `<pack>:<name>`: one word with one colon, neither side empty. */
const PACK_NAME = /^[^\s:]+:[^\s:]+$/;
/** `<pack> <x>-<name>`: two words on one line. */
const PACK_AND_CLASS = /^(\S+)[ \t]+([^\s-]+)-(\S+)$/;
/** Font Awesome's pack names, whose icon classes are `fa-<name>` (core's D296 prefixes). */
const FONT_AWESOME = /^fa[bdklrs]?$/;

/**
 * The glyph name of an `::icon(…)` reference (D297), or `undefined` when it is in neither form
 * D297 accepts: `mdi:fire` as written; `<pack> <x>-<name>` as `<pack>:<name>` when `<x>` is the
 * pack (`mdi mdi-fire`) or `fa` after a Font Awesome pack (`fa fa-book`, `fab fa-github`). Any
 * other reference (`fa-book`, `bomb`, `mdi fa-book`) is never looked up: it is shown as written.
 */
export function mindmapIconName(reference: string): string | undefined {
  const text = reference.trim();
  if (PACK_NAME.test(text)) return text;
  const m = PACK_AND_CLASS.exec(text);
  if (!m) return undefined;
  const [, pack = '', prefix, name = ''] = m;
  return prefix === pack || (prefix === 'fa' && FONT_AWESOME.test(pack))
    ? `${pack}:${name}`
    : undefined;
}

/** Every node's icon that has a glyph name ({@link mindmapIconName}), in source order. */
export function mindmapIcons(model: MindmapModel): readonly string[] {
  return model.nodes.flatMap((n) => {
    const name = n.icon && mindmapIconName(n.icon.text);
    return name ? [name] : [];
  });
}
