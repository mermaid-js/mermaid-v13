/**
 * The `treeView` options the layout and the renderer read. The schema section is `pending`
 * until the integration ticket (#577) makes these keys `honoured` and the plugin carries the
 * generated defaults; until then the defaults here are v12's (`config.schema.yaml`
 * `TreeViewDiagramConfig`, `defaultConfig.ts:288-291`). A length is a finite number of 0 or
 * more, or a string that reads as one (v12 used `"20"` by coercion); anything else falls back to
 * the default (#577 decides on a warning). `showIcons` is v12's truthiness; `defaultIconPack` a
 * string; the icon maps plain objects.
 */
import type { TreeViewIconOptions } from './icons.ts';

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

/** v12's defaults. */
export const TREEVIEW_DEFAULTS: Readonly<Record<LengthKey, number>> & TreeViewIconOptions = {
  rowIndent: 10,
  paddingX: 5,
  paddingY: 5,
  lineThickness: 1,
  showIcons: false,
  defaultIconPack: '',
};

const LENGTHS: readonly LengthKey[] = ['rowIndent', 'paddingX', 'paddingY', 'lineThickness'];

/** A finite number of 0 or more, or a string that reads as one; else undefined. */
function length(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** A plain object of strings (the icon maps), else undefined. */
function iconMap(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) if (typeof v === 'string') out[k] = v;
  return out;
}

/** The layout's options from the resolved `treeView` section. */
export function treeViewLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): TreeViewLayoutConfig {
  const given = section ?? {};
  const d = TREEVIEW_DEFAULTS;
  const lengths = {} as Record<LengthKey, number>;
  for (const key of LENGTHS) lengths[key] = length(given[key]) ?? d[key];
  const filenameIcons = iconMap(given.filenameIcons);
  const extensionIcons = iconMap(given.extensionIcons);
  return {
    ...lengths,
    showIcons: Boolean(given.showIcons),
    defaultIconPack:
      typeof given.defaultIconPack === 'string' ? given.defaultIconPack : d.defaultIconPack,
    ...(filenameIcons ? { filenameIcons } : {}),
    ...(extensionIcons ? { extensionIcons } : {}),
  };
}
