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
 * The section is v12's `wardley-beta` (the plugin's `configSection`), honoured from every source,
 * front matter and `%%{init}` included (D421; v12's sanitiser dropped it there). The defaults are
 * the schema's, generated into `generated/config-defaults.ts` (v12's, `wardleyRenderer.ts:52-65`).
 */
import type { RenderContext, Warning } from '@mermaid-js/core';
import type { WardleyDiagramConfig } from '@mermaid-js/core/config';
import { configNumber, shownValue as shown, useMaxWidth } from '@mermaid-js/shared/config/readers';
import { WARDLEY_CONFIG_INVALID } from './codes.ts';
import { wardleyBetaConfigDefaults } from './generated/config-defaults.ts';
import type { WardleyModel } from './model.ts';

/** The config section wardley reads: v12's name (D421). */
export const WARDLEY_SECTION = 'wardley-beta';

/** A section's options, as the resolved config holds them. */
type Section = Readonly<Record<string, unknown>>;

/** The resolved `wardley-beta` section (D421), which the layout and the renderer read. */
export function wardleySection(config: RenderContext['config']): Section | undefined {
  return config[WARDLEY_SECTION] as Section | undefined;
}

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

/** The schema's defaults, v12's. */
const DEFAULTS = wardleyBetaConfigDefaults as WardleyLayoutConfig;

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

/**
 * The layout's options from the resolved `wardley-beta` section and the map's `size`, each
 * checked: the canvas is the `size`'s, else the config's.
 */
export function wardleyLayoutConfig(
  section: Section | undefined,
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
      message: `${WARDLEY_SECTION}.${key} is ${shown(given[key])}, not ${RANGES[key].wants}; using the default ${DEFAULTS[key]}`,
      path: `${WARDLEY_SECTION}.${key}`,
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
        warn({ code: WARDLEY_CONFIG_INVALID, message, path: `${WARDLEY_SECTION}.padding` });
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
export function wardleyUseMaxWidth(section: Section | undefined): boolean {
  return useMaxWidth(section?.useMaxWidth, 'truthy');
}
