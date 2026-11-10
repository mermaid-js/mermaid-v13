/**
 * The `treeView` options, read here for the layout, the renderer, the text entry and the facet
 * (D226: never NaN, warn once per key). The defaults are the schema's (`pnpm gen:config` from
 * `core/schema/config.schema.yaml` `TreeViewDiagramConfig`, v12's `defaultConfig`). The config
 * resolver checks neither types nor the schema's minimums, so a directive can set
 * `"rowIndent": "20"` or `-5`.
 *
 * A length is a number of 0 or more, or a numeric string as its number (v12 did arithmetic on
 * what it was given, so a string concatenated: `rowIndent: '20'` with `paddingX` 5 indented each
 * level by `'205'`, 205 px). `showIcons` is v12's truthiness; `defaultIconPack` a string; the icon
 * maps plain objects, whose entries that are not strings are skipped. A negative length, one that
 * is not a number, a `defaultIconPack` that is not a string or an icon map that is not an object
 * falls back to the default with one `TREEVIEW_CONFIG_INVALID` warning per key, when the caller
 * passes `warn` (the layout does; the parse, the text entry and the facet read the same options
 * quietly, so a render warns once).
 */
import type { Warning } from '@mermaid-js/core';
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
import { treeViewConfigDefaults } from './generated/config-defaults.ts';
import type { TreeViewIconOptions } from './icons.ts';
import { rawConfigNumber as configNumber } from '@mermaid-js/core/config';
import { shownValue as shown } from '@mermaid-js/core/config';
import { useMaxWidth } from '@mermaid-js/core/config';

export const TREEVIEW_CONFIG_INVALID = 'TREEVIEW_CONFIG_INVALID';

/** The `treeView` section's options, each checked and set (`treeViewOptions`). */
export interface TreeViewOptions extends TreeViewIconOptions {
  /** How much further in a child's connector starts than its parent's label. */
  readonly rowIndent: number;
  /** Around a label, left and right. */
  readonly paddingX: number;
  /** Around a label, above and below. */
  readonly paddingY: number;
  /** The connectors' stroke width. */
  readonly lineThickness: number;
}

type LengthKey = 'rowIndent' | 'paddingX' | 'paddingY' | 'lineThickness';

/** The keys the schema gives a default: all but `useWidth`, which treeView ignores. */
type DefaultKey = Exclude<keyof TreeViewDiagramConfig, 'useWidth'>;

/**
 * The schema's default for `key`. `pnpm gen:config` writes one for every `DefaultKey`
 * (`conformance/src/treeView/config.spec.ts` pins them), so the throw only fires on a schema
 * edit that drops one without a regenerate.
 */
function schemaDefault<K extends DefaultKey>(key: K): NonNullable<TreeViewDiagramConfig[K]> {
  const value = treeViewConfigDefaults[key];
  if (value === undefined) throw new Error(`treeView.${key} has no default: run pnpm gen:config`);
  return value;
}

const DEFAULT_LENGTHS: Readonly<Record<LengthKey, number>> = {
  rowIndent: schemaDefault('rowIndent'),
  paddingX: schemaDefault('paddingX'),
  paddingY: schemaDefault('paddingY'),
  lineThickness: schemaDefault('lineThickness'),
};
const DEFAULT_SHOW_ICONS = schemaDefault('showIcons');
const DEFAULT_ICON_PACK = schemaDefault('defaultIconPack');

const LENGTHS: readonly LengthKey[] = ['rowIndent', 'paddingX', 'paddingY', 'lineThickness'];
const MAPS = ['filenameIcons', 'extensionIcons'] as const;

/** `value` when it is a plain object (the icon maps), its string entries; else undefined. */
function iconMap(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

/**
 * The options from the resolved `treeView` section, each checked (`undefined`: the defaults);
 * `warn` is told once per key that falls back.
 */
export function treeViewOptions(
  section: Readonly<TreeViewDiagramConfig> | undefined,
  warn?: (w: Warning) => void
): TreeViewOptions {
  // Read as unknown: the resolver passes what the author wrote, whatever its type.
  const given: Readonly<Record<string, unknown>> = section ?? {};
  const invalid = (key: string, wants: string, used: unknown): void =>
    warn?.({
      code: TREEVIEW_CONFIG_INVALID,
      message: `treeView.${key} is ${shown(given[key])}, not ${wants}; using the default ${shown(used)}`,
    });
  const lengths: Record<LengthKey, number> = { ...DEFAULT_LENGTHS };
  for (const key of LENGTHS) {
    if (given[key] === undefined) continue;
    const n = configNumber(given[key]);
    if (Number.isFinite(n) && n >= 0) lengths[key] = n;
    else invalid(key, 'a number of 0 or more', DEFAULT_LENGTHS[key]);
  }
  let defaultIconPack = DEFAULT_ICON_PACK;
  if (typeof given.defaultIconPack === 'string') defaultIconPack = given.defaultIconPack;
  else if (given.defaultIconPack !== undefined)
    invalid('defaultIconPack', 'a string', DEFAULT_ICON_PACK);
  const maps: Partial<Record<(typeof MAPS)[number], Readonly<Record<string, string>>>> = {};
  for (const key of MAPS) {
    if (given[key] === undefined) continue;
    const map = iconMap(given[key]);
    if (map) maps[key] = map;
    else invalid(key, 'a map of names to icons', {});
  }
  return {
    rowIndent: lengths.rowIndent,
    paddingX: lengths.paddingX,
    paddingY: lengths.paddingY,
    lineThickness: lengths.lineThickness,
    showIcons: given.showIcons === undefined ? DEFAULT_SHOW_ICONS : Boolean(given.showIcons),
    defaultIconPack,
    ...maps,
  };
}

/** v12's `useMaxWidth` (default true): only a falsy value turns it off (`configureSvgSize`). */
export function treeViewUseMaxWidth(
  section: Readonly<Pick<TreeViewDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  return useMaxWidth(section?.useMaxWidth, 'truthy');
}
