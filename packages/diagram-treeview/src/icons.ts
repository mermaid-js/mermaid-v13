/**
 * Which icon a node draws (v12's `icons.ts` `detectIcon` and `getNodeIcon`), for the renderer
 * (T4): a pure function of the node and the `treeView` options. Icons are named as v12 named
 * them: `pack:name`, or `mermaid-treeview:file` / `mermaid-treeview:folder` for the two built-in
 * glyphs, which treeView draws itself (D485: no icon pack is registered).
 *
 * D486: the icon maps are read by own property, so a file named `constructor`, `toString` or
 * `a.constructor` gets its default icon instead of v12's crash; so is the built-in name set, so
 * `icon(constructor)` takes `defaultIconPack` like any other unprefixed name (v12 read it as a
 * built-in through the prototype).
 */

/** The prefix of the built-in glyphs. */
export const BUILTIN_ICON_PACK = 'mermaid-treeview';
/** The built-in glyphs. */
export const BUILTIN_ICONS: readonly string[] = ['file', 'folder'];

/** Whether `name` (as `resolveIcon` gives it) is one of the built-in glyphs treeView draws. */
export function isBuiltinIcon(name: string): boolean {
  return name === `${BUILTIN_ICON_PACK}:file` || name === `${BUILTIN_ICON_PACK}:folder`;
}

/** The `treeView` options icon resolution reads. */
export interface TreeViewIconOptions {
  showIcons: boolean;
  /** The pack of an unprefixed `icon(name)`; `''` for none. */
  defaultIconPack: string;
  /** Exact file name → icon, for files when `showIcons` is on. */
  filenameIcons?: Readonly<Record<string, string>>;
  /** Extension (lower case, with or without its `.`) → icon, for files when `showIcons` is on. */
  extensionIcons?: Readonly<Record<string, string>>;
}

/** `map[key]` when `map` has it as its own property. */
function own(map: Readonly<Record<string, string>> | undefined, key: string): string | undefined {
  return map !== undefined && Object.hasOwn(map, key) ? map[key] : undefined;
}

/**
 * The icon the maps give a file name: an exact `filenameIcons` match, else its last extension
 * in `extensionIcons` (with the `.`, then without), case-insensitive; dotfiles have no
 * extension. Undefined when nothing matches (v12 `detectIcon`).
 */
export function detectIcon(name: string, options?: TreeViewIconOptions): string | undefined {
  const byName = own(options?.filenameIcons, name);
  if (byName) return byName;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  const ext = name.slice(dot).toLowerCase();
  return own(options?.extensionIcons, ext) ?? own(options?.extensionIcons, ext.slice(1));
}

/** An unprefixed name: a built-in glyph, else in `defaultIconPack`, else the built-in pack. */
function qualify(icon: string, defaultIconPack: string): string {
  if (icon.includes(':')) return icon;
  if (BUILTIN_ICONS.includes(icon) || !defaultIconPack) return `${BUILTIN_ICON_PACK}:${icon}`;
  return `${defaultIconPack}:${icon}`;
}

/**
 * The icon to draw for a node, or undefined for none (v12 `getNodeIcon`): `icon(none)` (and
 * `icon()`) draws none; any other `icon(…)` wins; else with `showIcons` a file takes what the
 * maps give (`none` hides it) and otherwise the built-in `file` or `folder`.
 */
export function resolveIcon(
  node: { readonly name: string; readonly directory: boolean; readonly icon?: string },
  options: TreeViewIconOptions
): string | undefined {
  if (node.icon === 'none') return undefined;
  if (node.icon) return qualify(node.icon, options.defaultIconPack);
  if (!options.showIcons) return undefined;
  if (!node.directory) {
    const detected = detectIcon(node.name, options);
    if (detected === 'none') return undefined;
    if (detected) return qualify(detected, options.defaultIconPack);
  }
  return `${BUILTIN_ICON_PACK}:${node.directory ? 'folder' : 'file'}`;
}
