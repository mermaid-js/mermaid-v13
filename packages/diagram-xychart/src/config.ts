/**
 * The `xyChart` options, read here for the layout (and the renderer). The defaults are the
 * section's generated ones (`generated/config-defaults.ts`, from `config.schema.yaml`).
 *
 * Values are taken as v12 took them (`cleanAndMerge` checks no schema range, story 6, D383):
 * any finite number (or numeric string, as the other ports read a length) for a number key, any
 * boolean for a boolean key, even outside the schema's range (`plotReservedSpacePercent: 20`).
 * Anything else falls back to the default (D383: never NaN) with one `XYCHART_CONFIG_INVALID`
 * warning per key, as radar's T5 does (#449). v12's own rules stay: a `labelRotation` outside
 * ±90 is 0 (`axis/baseAxis.ts:37-40`), and `chartOrientation` is `horizontal` only as written
 * (any other value is `vertical`, a value that is neither warns). 12.2.0's default config
 * leaks a `"$ref"` key into each axis: the schema lists it `ignored`, and it is not read.
 */
import type { Warning } from '@mermaid-js/core';
import type { XYChartAxisConfig, XYChartConfig } from '@mermaid-js/core/config';
import { xyChartConfigDefaults } from './generated/config-defaults.ts';

export const XYCHART_CONFIG_INVALID = 'XYCHART_CONFIG_INVALID';

/** One axis's options, every one set (`$ref` is v12's leaked key, never read). */
export type XyChartAxisOptions = Required<Omit<XYChartAxisConfig, '$ref'>>;

/** The `xyChart` options the layout reads, every one set. */
export interface XyChartOptions
  extends Required<
    Pick<
      XYChartConfig,
      | 'useMaxWidth'
      | 'width'
      | 'height'
      | 'titleFontSize'
      | 'titlePadding'
      | 'showDataLabel'
      | 'showDataLabelOutsideBar'
      | 'showTitle'
      | 'showLegend'
      | 'legendFontSize'
      | 'legendPadding'
      | 'chartOrientation'
      | 'plotReservedSpacePercent'
    >
  > {
  readonly xAxis: XyChartAxisOptions;
  readonly yAxis: XyChartAxisOptions;
}

const { xAxis: X_DEFAULTS, yAxis: Y_DEFAULTS, ...TOP } = xyChartConfigDefaults;
const DEFAULTS = TOP as Omit<XyChartOptions, 'xAxis' | 'yAxis'>;
const AXIS_DEFAULTS = {
  xAxis: X_DEFAULTS as XyChartAxisOptions,
  yAxis: Y_DEFAULTS as XyChartAxisOptions,
};

type Section = Readonly<Record<string, unknown>> | undefined;

/** A finite number, or a string that reads as one; else undefined. */
export function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/**
 * `defaults` with each key of `given` that has the default's type taken; any other value set
 * for a key warns once (`path` names the section) and keeps the default.
 */
function read<T extends object>(
  defaults: T,
  given: Section,
  path: string,
  warn: (w: Warning) => void
): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  if (!given || typeof given !== 'object') return out as T;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const v = given[key];
    const d = defaults[key];
    if (v === undefined || typeof d === 'object' || key === 'chartOrientation') continue;
    const n = typeof d === 'number' ? configNumber(v) : undefined;
    if (typeof d === 'boolean' && typeof v === 'boolean') out[key] = v;
    else if (n !== undefined) out[key] = n;
    else
      warn({
        code: XYCHART_CONFIG_INVALID,
        message: `${path}.${key} is ${shown(v)}, not a ${typeof d}; using the default ${String(d)}`,
        path: `${path}.${key}`,
      });
  }
  return out as T;
}

/** v12's rotation rule: inside ±90 as given, else 0 (`axis/baseAxis.ts:37-40`). */
const rotation = (deg: number): number => (deg >= -90 && deg <= 90 ? deg : 0);

/** No warning sink: the options alone (the v12 spec adapter). */
const ignoreWarning = (): void => undefined;

/** The layout's options from the resolved `xyChart` section. */
export function xyChartOptions(
  section: Section,
  warn: (w: Warning) => void = ignoreWarning
): XyChartOptions {
  const top = read(DEFAULTS, section, 'xyChart', warn);
  const axis = (key: 'xAxis' | 'yAxis'): XyChartAxisOptions => {
    const given = section?.[key];
    if (given !== undefined && (given === null || typeof given !== 'object'))
      warn({
        code: XYCHART_CONFIG_INVALID,
        message: `xyChart.${key} is ${shown(given)}, not an object; using the defaults`,
        path: `xyChart.${key}`,
      });
    const options = read(AXIS_DEFAULTS[key], given as Section, `xyChart.${key}`, warn);
    return { ...options, labelRotation: rotation(options.labelRotation) };
  };
  const orientation = section?.chartOrientation;
  if (orientation !== undefined && orientation !== 'vertical' && orientation !== 'horizontal')
    warn({
      code: XYCHART_CONFIG_INVALID,
      message: `xyChart.chartOrientation is ${shown(orientation)}, not "vertical" or "horizontal"; using "vertical"`,
      path: 'xyChart.chartOrientation',
    });
  return {
    ...top,
    chartOrientation: orientation === 'horizontal' ? 'horizontal' : 'vertical',
    xAxis: axis('xAxis'),
    yAxis: axis('yAxis'),
  };
}
