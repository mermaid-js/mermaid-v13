/**
 * The `treemap` options, read here for the layout and the renderer (D226: never NaN, warn once
 * per key). The defaults are the schema's (`pnpm gen:config` from `core/schema/config.schema.yaml`,
 * v12's `defaultConfig.ts:326-337`). The config resolver does not check value types or the
 * schema's minimums, so a directive can set `"padding": -5` or `"nodeWidth": "wide"`.
 *
 * Each key is read as v12 read it where that gives a usable value: a length is a number, or a
 * numeric string as its number (v12 used `"20"` by coercion); `nodeWidth`/`nodeHeight` of 0 is
 * v12's fallback canvas; `showValues` is on unless `false`; an empty `valueFormat` is `,`. A
 * negative length, one that is not a number, or a `valueFormat` that is not a string falls back
 * to the default with one `TREEMAP_CONFIG_INVALID` warning per key (as radar's and packet's).
 */
import type { Warning } from '@mermaid-js/core';
import type { TreemapDiagramConfig } from '@mermaid-js/core/config';
import { treemapConfigDefaults } from './generated/config-defaults.ts';

export const TREEMAP_CONFIG_INVALID = 'TREEMAP_CONFIG_INVALID';

/** The `treemap` options the layout reads, every one set. */
export type TreemapLayoutConfig = Readonly<
  Required<
    Pick<
      TreemapDiagramConfig,
      'nodeWidth' | 'nodeHeight' | 'padding' | 'diagramPadding' | 'showValues' | 'valueFormat'
    >
  >
>;

type LengthKey = 'nodeWidth' | 'nodeHeight' | 'padding' | 'diagramPadding';

/** The length keys: each a number of 0 or more (`minimum: 0` in the schema). */
const LENGTHS: readonly LengthKey[] = ['nodeWidth', 'nodeHeight', 'padding', 'diagramPadding'];

/** Every `TreemapLayoutConfig` key: leaving one out fails to type-check. */
const KEYS: Readonly<Record<keyof TreemapLayoutConfig, true>> = {
  nodeWidth: true,
  nodeHeight: true,
  padding: true,
  diagramPadding: true,
  showValues: true,
  valueFormat: true,
};

/**
 * Whether the schema gives every layout key a default. The generated `TreemapDiagramConfig`
 * makes every key optional, so this is checked when the module loads; `config.spec.ts` pins it.
 */
function hasEveryDefault(
  d: TreemapDiagramConfig
): d is TreemapDiagramConfig & Required<Pick<TreemapDiagramConfig, keyof TreemapLayoutConfig>> {
  return Object.keys(KEYS).every((k) => Reflect.get(d, k) !== undefined);
}
if (!hasEveryDefault(treemapConfigDefaults)) {
  throw new Error('config.schema.yaml gives a TreemapDiagramConfig key no default');
}
const schema = treemapConfigDefaults;

/** The schema's defaults of the keys the layout reads. */
export const TREEMAP_DEFAULTS: TreemapLayoutConfig = Object.freeze({
  nodeWidth: schema.nodeWidth,
  nodeHeight: schema.nodeHeight,
  padding: schema.padding,
  diagramPadding: schema.diagramPadding,
  showValues: schema.showValues,
  valueFormat: schema.valueFormat,
});

/** A number, or a string that reads as one; else NaN. */
function configNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** The layout's options from the resolved `treemap` section, each checked. */
export function treemapLayoutConfig(
  section: Readonly<TreemapDiagramConfig> | undefined,
  warn: (w: Warning) => void
): TreemapLayoutConfig {
  const from: Readonly<Record<string, unknown>> = section ?? {};
  const d = TREEMAP_DEFAULTS;
  const out: { -readonly [K in keyof TreemapLayoutConfig]: TreemapLayoutConfig[K] } = { ...d };
  const invalid = (key: string, wants: string, used: unknown): void =>
    warn({
      code: TREEMAP_CONFIG_INVALID,
      message: `treemap.${key} is ${shown(from[key])}, not ${wants}; using the default ${shown(used)}`,
    });
  for (const key of LENGTHS) {
    if (from[key] === undefined) continue;
    const n = configNumber(from[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
    else invalid(key, 'a number of 0 or more', d[key]);
  }
  if (from.showValues !== undefined) out.showValues = from.showValues !== false;
  const format = from.valueFormat;
  if (typeof format === 'string') out.valueFormat = format === '' ? d.valueFormat : format;
  else if (format !== undefined) invalid('valueFormat', 'a d3-format specifier', d.valueFormat);
  return out;
}

/** v12's `useMaxWidth` (default true): only a falsy value turns it off (`configureSvgSize`). */
export function treemapUseMaxWidth(
  section: Readonly<Pick<TreemapDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  const value: unknown = section?.useMaxWidth;
  return value === undefined || Boolean(value);
}
