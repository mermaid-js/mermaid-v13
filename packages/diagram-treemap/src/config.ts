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
 * `showValues` and `valueFormat` are read by `options.ts`, which hover shares.
 */
import type { Warning } from '@mermaid-js/core';
import type { TreemapDiagramConfig } from '@mermaid-js/core/config';
import { TREEMAP_DEFAULTS, treemapValueOptions } from './options.ts';

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
  const given: Readonly<Record<string, unknown>> = section ?? {};
  const d = TREEMAP_DEFAULTS;
  const out: Record<LengthKey, number> = {
    nodeWidth: d.nodeWidth,
    nodeHeight: d.nodeHeight,
    padding: d.padding,
    diagramPadding: d.diagramPadding,
  };
  const invalid = (key: string, wants: string, used: unknown): void =>
    warn({
      code: TREEMAP_CONFIG_INVALID,
      message: `treemap.${key} is ${shown(given[key])}, not ${wants}; using the default ${shown(used)}`,
    });
  for (const key of LENGTHS) {
    if (given[key] === undefined) continue;
    const n = configNumber(given[key]);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
    else invalid(key, 'a number of 0 or more', d[key]);
  }
  return { ...out, ...treemapValueOptions(given, invalid) };
}

/** v12's `useMaxWidth` (default true): only a falsy value turns it off (`configureSvgSize`). */
export function treemapUseMaxWidth(
  section: Readonly<Pick<TreemapDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  const value: unknown = section?.useMaxWidth;
  return value === undefined || Boolean(value);
}
