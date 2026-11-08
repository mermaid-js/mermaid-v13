/**
 * The `wardley-beta` options the layout reads, checked (D424, D226: never NaN, never nothing).
 * v12 checked no minimum, so `size [0, 0]` drew a 0 × 0 view box, a `nodeRadius` of 0 drew no
 * node and a padding of half the canvas left no chart. Each key is read as the other ports read
 * a length: a number, or a numeric string as its number, at or above the key's schema minimum
 * (`nodeRadius` above 0). Anything else falls back to the default with one
 * `WARDLEY_CONFIG_INVALID` warning per key, as radar's and cynefin's (D366); so does a `size`
 * dimension below 1, to the configured `width` or `height`, and a `padding` that leaves no chart
 * on the canvas (twice the padding at least the width or height), to the default, or to 0 where
 * the default leaves none either. `showGrid` is read for truth, as v12 read it.
 *
 * The keys are `pending` in the schema until T5 (#497), which makes them `honoured` and
 * generates `generated/config-defaults.ts`; until then the defaults are written here, v12's
 * (`config.schema.yaml` `WardleyDiagramConfig`, the same as `wardleyRenderer.ts:52-65`).
 */
import type { Warning } from '@mermaid-js/core';
import type { WardleyDiagramConfig } from '@mermaid-js/core/config';
import type { WardleyModel } from './model.ts';

export const WARDLEY_CONFIG_INVALID = 'WARDLEY_CONFIG_INVALID';

/** The options the layout reads, every one set. */
export type WardleyLayoutConfig = Required<
  Pick<
    WardleyDiagramConfig,
    | 'width'
    | 'height'
    | 'padding'
    | 'nodeRadius'
    | 'nodeLabelOffset'
    | 'axisFontSize'
    | 'labelFontSize'
    | 'showGrid'
  >
>;

type LengthKey = Exclude<keyof WardleyLayoutConfig, 'showGrid'>;

/** v12's defaults. */
const DEFAULTS: WardleyLayoutConfig = {
  width: 900,
  height: 600,
  padding: 48,
  nodeRadius: 6,
  nodeLabelOffset: 8,
  axisFontSize: 12,
  labelFontSize: 10,
  showGrid: false,
};

/** Each length's least valid value and how a warning names the range. */
interface Range {
  readonly min: number;
  /** The minimum itself is out of range (`nodeRadius`: 0 draws nothing). */
  readonly exclusive?: boolean;
  readonly wants: string;
}

const AT_LEAST_1: Range = { min: 1, wants: 'a number of 1 or more' };
const AT_LEAST_0: Range = { min: 0, wants: 'a number of 0 or more' };

const RANGES: Readonly<Record<LengthKey, Range>> = {
  width: AT_LEAST_1,
  height: AT_LEAST_1,
  padding: AT_LEAST_0,
  nodeRadius: { min: 0, exclusive: true, wants: 'a number above 0' },
  nodeLabelOffset: AT_LEAST_0,
  axisFontSize: AT_LEAST_0,
  labelFontSize: AT_LEAST_0,
};

const inRange = (n: number, range: Range): boolean =>
  range.exclusive ? n > range.min : n >= range.min;

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/**
 * The layout's options from the resolved `wardley-beta` section and the map's `size`, each
 * checked: the canvas is the `size`'s, else the config's.
 */
export function wardleyLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  size: WardleyModel['size'],
  warn: (w: Warning) => void
): WardleyLayoutConfig {
  const given = section ?? {};
  const warned = new Set<LengthKey>();
  const length = (key: LengthKey): number => {
    if (!Object.hasOwn(given, key) || given[key] === undefined) return DEFAULTS[key];
    const n = configNumber(given[key]);
    if (n !== undefined && inRange(n, RANGES[key])) return n;
    warned.add(key);
    warn({
      code: WARDLEY_CONFIG_INVALID,
      message: `wardley-beta.${key} is ${shown(given[key])}, not ${RANGES[key].wants}; using the default ${DEFAULTS[key]}`,
      path: `wardley-beta.${key}`,
    });
    return DEFAULTS[key];
  };
  let width = length('width');
  let height = length('height');
  if (size) {
    const bad = (['width', 'height'] as const).filter((k) => !inRange(size[k], AT_LEAST_1));
    if (!bad.includes('width')) width = size.width;
    if (!bad.includes('height')) height = size.height;
    if (bad.length > 0)
      warn({
        code: WARDLEY_CONFIG_INVALID,
        message: `size [${size.width}, ${size.height}] has a ${bad.join(' and a ')} below 1; using ${width} × ${height}`,
        astIds: [size.astId],
      });
  }
  return {
    width,
    height,
    padding: paddingFor(length('padding'), { width, height }, (message) => {
      // One warning per key: a padding already reported falls back without a second.
      if (!warned.has('padding'))
        warn({ code: WARDLEY_CONFIG_INVALID, message, path: 'wardley-beta.padding' });
    }),
    nodeRadius: length('nodeRadius'),
    nodeLabelOffset: length('nodeLabelOffset'),
    axisFontSize: length('axisFontSize'),
    labelFontSize: length('labelFontSize'),
    showGrid: given.showGrid === undefined ? DEFAULTS.showGrid : Boolean(given.showGrid),
  };
}

/** A padding that leaves a chart: as given, else the default, else 0 (D424). */
function paddingFor(
  padding: number,
  canvas: { readonly width: number; readonly height: number },
  invalid: (message: string) => void
): number {
  const fits = (p: number): boolean => p * 2 < Math.min(canvas.width, canvas.height);
  if (fits(padding)) return padding;
  const used = fits(DEFAULTS.padding) ? DEFAULTS.padding : 0;
  invalid(
    `the padding ${padding} leaves no chart on a ${canvas.width} × ${canvas.height} canvas; using ${used}`
  );
  return used;
}

/**
 * `wardley-beta.useMaxWidth`, for the renderer, as v12 read it (`?? true`, then for truth):
 * unset or truthy scales to the container.
 */
export function wardleyUseMaxWidth(
  section: Readonly<Record<string, unknown>> | undefined
): boolean {
  const value = section?.useMaxWidth;
  return value === undefined ? true : Boolean(value);
}
