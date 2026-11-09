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

/** v12's config section name, which the plugin names as its `configSection` (the id is `xychart`). */
export const XYCHART_SECTION = 'xyChart';

type Warn = (w: Warning) => void;
type Section = Readonly<Record<string, unknown>> | undefined;
type TopOptions = Omit<XyChartOptions, 'xAxis' | 'yAxis' | 'chartOrientation'>;

/*
 * The generated defaults are typed `XYChartConfig`, whose keys are all optional, so these casts
 * cannot fail on a missing key; `config.spec.ts` checks every option has a default, and
 * `conformance/src/xychart/config.spec.ts` that the defaults are v12's.
 */
const {
  xAxis: X_AXIS_DEFAULTS,
  yAxis: Y_AXIS_DEFAULTS,
  chartOrientation: _orientation,
  ...TOP_LEVEL_DEFAULTS
} = xyChartConfigDefaults;
const DEFAULTS = TOP_LEVEL_DEFAULTS as TopOptions;
const AXIS_DEFAULTS = {
  xAxis: X_AXIS_DEFAULTS as XyChartAxisOptions,
  yAxis: Y_AXIS_DEFAULTS as XyChartAxisOptions,
};

/** A finite number, or a string that reads as one; else undefined. */
export function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A value as a warning quotes it. */
const quoted = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** One `XYCHART_CONFIG_INVALID` warning: `path` is `value`, not `wants`; `fallback` is drawn. */
function invalid(warn: Warn, path: string, value: unknown, wants: string, fallback: string): void {
  warn({
    code: XYCHART_CONFIG_INVALID,
    message: `${path} is ${quoted(value)}, not ${wants}; using ${fallback}`,
    path,
  });
}

/**
 * `defaults` with each number or boolean key of `given` taken when it has the default's type
 * (a number also as a numeric string); any other value warns once and keeps the default.
 */
function read<T extends object>(defaults: T, given: unknown, path: string, warn: Warn): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  if (!given || typeof given !== 'object') return out as T;
  for (const [key, d] of Object.entries(defaults)) {
    const v = (given as Record<string, unknown>)[key];
    if (v === undefined) continue;
    const n = typeof d === 'number' ? configNumber(v) : undefined;
    if (typeof d === 'boolean' && typeof v === 'boolean') out[key] = v;
    else if (n !== undefined) out[key] = n;
    else invalid(warn, `${path}.${key}`, v, `a ${typeof d}`, `the default ${String(d)}`);
  }
  return out as T;
}

/** v12's rotation rule: inside ±90 as given, else 0 (`axis/baseAxis.ts:37-40`). */
const rotation = (deg: number): number => (deg >= -90 && deg <= 90 ? deg : 0);

/** No warning sink: the options alone (the v12 spec adapter, a layout without `warn`). */
export const ignoreWarning: Warn = () => undefined;

/** v12's orientation rule: `horizontal` only as written; any other value is `vertical`. */
function orientationOf(value: unknown, warn: Warn): XyChartOptions['chartOrientation'] {
  if (value !== undefined && value !== 'vertical' && value !== 'horizontal')
    invalid(
      warn,
      `${XYCHART_SECTION}.chartOrientation`,
      value,
      '"vertical" or "horizontal"',
      '"vertical"'
    );
  return value === 'horizontal' ? 'horizontal' : 'vertical';
}

/** The layout's options from the resolved `xyChart` section. */
export function xyChartOptions(section: Section, warn: Warn = ignoreWarning): XyChartOptions {
  const axis = (key: 'xAxis' | 'yAxis'): XyChartAxisOptions => {
    const given = section?.[key];
    const path = `${XYCHART_SECTION}.${key}`;
    if (given !== undefined && (given === null || typeof given !== 'object'))
      invalid(warn, path, given, 'an object', 'the defaults');
    const options = read(AXIS_DEFAULTS[key], given, path, warn);
    return { ...options, labelRotation: rotation(options.labelRotation) };
  };
  return {
    ...read(DEFAULTS, section, XYCHART_SECTION, warn),
    chartOrientation: orientationOf(section?.chartOrientation, warn),
    xAxis: axis('xAxis'),
    yAxis: axis('yAxis'),
  };
}
