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

export const TREEVIEW_CONFIG_INVALID = 'TREEVIEW_CONFIG_INVALID';

export interface TreeViewLayoutConfig extends TreeViewIconOptions {
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

const SCHEMA = treeViewConfigDefaults as Required<TreeViewDiagramConfig>;

/** The section's defaults (generated from the schema). */
export const TREEVIEW_DEFAULTS: Readonly<Record<LengthKey, number>> & TreeViewIconOptions = {
  rowIndent: SCHEMA.rowIndent,
  paddingX: SCHEMA.paddingX,
  paddingY: SCHEMA.paddingY,
  lineThickness: SCHEMA.lineThickness,
  showIcons: SCHEMA.showIcons,
  defaultIconPack: SCHEMA.defaultIconPack,
};

const LENGTHS: readonly LengthKey[] = ['rowIndent', 'paddingX', 'paddingY', 'lineThickness'];
const MAPS = ['filenameIcons', 'extensionIcons'] as const;

/** A number, or a string that reads as one; else NaN. */
function configNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/** `value` when it is a plain object (the icon maps), its string entries; else undefined. */
function iconMap(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/**
 * The options from the resolved `treeView` section, each checked; `warn` is told once per key
 * that falls back.
 */
export function treeViewLayoutConfig(
  section: Readonly<TreeViewDiagramConfig> | undefined,
  warn?: (w: Warning) => void
): TreeViewLayoutConfig {
  // Read as unknown: the resolver passes what the author wrote, whatever its type.
  const given: Readonly<Record<string, unknown>> = section ?? {};
  const d = TREEVIEW_DEFAULTS;
  const invalid = (key: string, wants: string, used: unknown): void =>
    warn?.({
      code: TREEVIEW_CONFIG_INVALID,
      message: `treeView.${key} is ${shown(given[key])}, not ${wants}; using the default ${shown(used)}`,
    });
  const lengths = { ...d } as Record<LengthKey, number>;
  for (const key of LENGTHS) {
    if (given[key] === undefined) continue;
    const n = configNumber(given[key]);
    if (Number.isFinite(n) && n >= 0) lengths[key] = n;
    else invalid(key, 'a number of 0 or more', d[key]);
  }
  let defaultIconPack = d.defaultIconPack;
  if (typeof given.defaultIconPack === 'string') defaultIconPack = given.defaultIconPack;
  else if (given.defaultIconPack !== undefined)
    invalid('defaultIconPack', 'a string', d.defaultIconPack);
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
    showIcons: Boolean(given.showIcons),
    defaultIconPack,
    ...maps,
  };
}

/** v12's `useMaxWidth` (default true): only a falsy value turns it off (`configureSvgSize`). */
export function treeViewUseMaxWidth(
  section: Readonly<Pick<TreeViewDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  const value: unknown = section?.useMaxWidth;
  return value === undefined || Boolean(value);
}
