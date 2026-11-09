/**
 * The `treeView` options the layout and the renderer read. The schema section is `pending`
 * until the integration ticket (#577) makes these keys `honoured` and the plugin carries the
 * generated defaults; until then the defaults here are v12's (`config.schema.yaml`
 * `TreeViewDiagramConfig`). The config resolver checks neither types nor the schema's
 * minimums, so a directive can set `"rowIndent": "20"` or `-5`. A length is used only when it
 * is a finite number of 0 or more; anything else is the default. v12 did arithmetic on what it
 * was given, so a string concatenated: `rowIndent: '20'` with `paddingX` 5 indented each level
 * by `'205'`, 205 px. The warning for such a value is #577's (GAPS T5). `showIcons` is v12's truthiness;
 * `defaultIconPack` a string; the icon maps plain objects of strings.
 */
import type { TreeViewDiagramConfig } from '@mermaid-js/core/config';
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

/** `value` when it is a finite number of 0 or more; else undefined. */
function length(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
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
  section: Readonly<TreeViewDiagramConfig> | undefined
): TreeViewLayoutConfig {
  // Read as unknown: the resolver passes what the author wrote, whatever its type.
  const given: Readonly<Record<string, unknown>> = section ?? {};
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

/** v12's `useMaxWidth` (default true): only a falsy value turns it off (`configureSvgSize`). */
export function treeViewUseMaxWidth(
  section: Readonly<Pick<TreeViewDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  const value: unknown = section?.useMaxWidth;
  return value === undefined || Boolean(value);
}
