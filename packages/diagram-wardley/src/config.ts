/**
 * The `wardley-beta` options the layout reads, checked (D424, D226: never NaN, warn once). v12
 * checked no minimum, so `size [0, 0]` drew a 0 × 0 view box and a `width` or `nodeRadius` below
 * 0 drew nothing or NaN. Each key is read as the other ports read a length: a number, or a
 * numeric string as its number, at or above the key's schema minimum. Anything else falls back
 * to the default with one `WARDLEY_CONFIG_INVALID` warning per key; so does a `size` dimension
 * below 1, to the configured `width` or `height`. `showGrid` is read for truth, as v12 read it.
 *
 * The keys are `pending` in the schema until T5 (#497), which makes them `honoured` and
 * generates `generated/config-defaults.ts`; until then the defaults are written here, v12's
 * (`config.schema.yaml` `WardleyDiagramConfig`, the same as `wardleyRenderer.ts:52-65`).
 */
import type { Warning } from '@mermaid-js/core';
import type { AstId } from '@mermaid-js/core/parser-kit';

export const WARDLEY_CONFIG_INVALID = 'WARDLEY_CONFIG_INVALID';

/** The options the layout reads, every one set. */
export interface WardleyLayoutConfig {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly nodeRadius: number;
  readonly nodeLabelOffset: number;
  readonly axisFontSize: number;
  readonly labelFontSize: number;
  readonly showGrid: boolean;
}

type NumberKey = Exclude<keyof WardleyLayoutConfig, 'showGrid'>;

/** v12's defaults. */
const WARDLEY_CONFIG_DEFAULTS: WardleyLayoutConfig = {
  width: 900,
  height: 600,
  padding: 48,
  nodeRadius: 6,
  nodeLabelOffset: 8,
  axisFontSize: 12,
  labelFontSize: 10,
  showGrid: false,
};

/** Each number key's schema minimum. */
const MINIMA: Readonly<Record<NumberKey, number>> = {
  width: 1,
  height: 1,
  padding: 0,
  nodeRadius: 0,
  nodeLabelOffset: 0,
  axisFontSize: 0,
  labelFontSize: 0,
};

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** The map's own `size [width, height]`, if it has one. */
export interface WardleySize {
  readonly width: number;
  readonly height: number;
  readonly astId: AstId;
}

/**
 * The layout's options from the resolved `wardley-beta` section and the map's `size`, each
 * checked: the canvas is the `size`'s, else the config's.
 */
export function wardleyLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  size: WardleySize | undefined,
  warn: (w: Warning) => void
): WardleyLayoutConfig {
  const given = section ?? {};
  const out: Record<string, number | boolean> = { ...WARDLEY_CONFIG_DEFAULTS };
  for (const key of Object.keys(MINIMA) as NumberKey[]) {
    if (!Object.hasOwn(given, key) || given[key] === undefined) continue;
    const n = configNumber(given[key]);
    if (n !== undefined && n >= MINIMA[key]) out[key] = n;
    else
      warn({
        code: WARDLEY_CONFIG_INVALID,
        message: `wardley-beta.${key} is ${shown(given[key])}, not a number of ${MINIMA[key]} or more; using the default ${WARDLEY_CONFIG_DEFAULTS[key]}`,
        path: `wardley-beta.${key}`,
      });
  }
  if (given.showGrid !== undefined) out.showGrid = Boolean(given.showGrid);
  if (size) {
    const bad = (['width', 'height'] as const).filter((k) => !(size[k] >= MINIMA[k]));
    for (const k of ['width', 'height'] as const) if (!bad.includes(k)) out[k] = size[k];
    if (bad.length > 0)
      warn({
        code: WARDLEY_CONFIG_INVALID,
        message: `size [${size.width}, ${size.height}] has a ${bad.join(' and a ')} below ${MINIMA.width}; using ${bad.map((k) => `the ${k} ${out[k]}`).join(' and ')}`,
        astIds: [size.astId],
      });
  }
  return out as unknown as WardleyLayoutConfig;
}
