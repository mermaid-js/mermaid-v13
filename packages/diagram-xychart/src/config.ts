/**
 * The `xyChart` options, read here for the layout (and the renderer). Until T5 (#513) generates
 * `generated/config-defaults.ts` and makes the keys `honoured`, the defaults are v12's
 * (`config.schema.yaml` `XYChartConfig`, `XYChartAxisConfig`). The config resolver does not
 * check value types, so each key is read when it has the schema's type and range, and falls
 * back to its default otherwise (D383: never NaN). So a `labelRotation` outside ±90 is 0, as v12
 * made it (`axis/baseAxis.ts:37-40`); `chartOrientation` is `horizontal` only as written. T5
 * decides whether a bad value warns.
 */
import type { XYChartAxisConfig, XYChartConfig } from '@mermaid-js/core/config';

/** One axis's options, every one set. */
export type XyChartAxisOptions = Required<XYChartAxisConfig>;

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

const AXIS_DEFAULTS: XyChartAxisOptions = {
  showLabel: true,
  labelFontSize: 14,
  labelPadding: 5,
  showTitle: true,
  titleFontSize: 16,
  titlePadding: 5,
  showTick: true,
  tickLength: 5,
  tickWidth: 2,
  showAxisLine: true,
  axisLineWidth: 2,
  labelRotation: 0,
};

const DEFAULTS: Omit<XyChartOptions, 'xAxis' | 'yAxis'> = {
  useMaxWidth: true,
  width: 700,
  height: 500,
  titleFontSize: 20,
  titlePadding: 10,
  showDataLabel: false,
  showDataLabelOutsideBar: false,
  showTitle: true,
  showLegend: true,
  legendFontSize: 14,
  legendPadding: 10,
  chartOrientation: 'vertical',
  plotReservedSpacePercent: 50,
};

/** A number key's schema range: `[minimum, maximum]`. */
type Range = readonly [number, number];

const AXIS_RANGES: Readonly<Partial<Record<keyof XyChartAxisOptions, Range>>> = {
  labelFontSize: [1, Infinity],
  labelPadding: [0, Infinity],
  titleFontSize: [1, Infinity],
  titlePadding: [0, Infinity],
  tickLength: [1, Infinity],
  tickWidth: [1, Infinity],
  axisLineWidth: [1, Infinity],
  labelRotation: [-90, 90],
};

const RANGES: Readonly<Partial<Record<keyof XyChartOptions, Range>>> = {
  width: [1, Infinity],
  height: [1, Infinity],
  titleFontSize: [1, Infinity],
  titlePadding: [0, Infinity],
  legendFontSize: [1, Infinity],
  legendPadding: [0, Infinity],
  plotReservedSpacePercent: [30, Infinity],
};

type Section = Readonly<Record<string, unknown>> | undefined;

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** `defaults` with each key of `given` that has the default's type (and range) taken. */
function read<T extends object>(
  defaults: T,
  ranges: Readonly<Partial<Record<keyof T, Range>>>,
  given: Section
): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  if (given === undefined || typeof given !== 'object') return out as T;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const v = given[key];
    const d = defaults[key];
    if (typeof d === 'boolean' && typeof v === 'boolean') out[key] = v;
    else if (typeof d === 'number') {
      const n = configNumber(v);
      const [lo, hi] = ranges[key] ?? [-Infinity, Infinity];
      if (n !== undefined && n >= lo && n <= hi) out[key] = n;
    }
  }
  return out as T;
}

/** The layout's options from the resolved `xyChart` section. */
export function xyChartOptions(section: Section): XyChartOptions {
  const top = read(DEFAULTS, RANGES, section);
  const axis = (key: 'xAxis' | 'yAxis'): XyChartAxisOptions =>
    read(AXIS_DEFAULTS, AXIS_RANGES, section?.[key] as Section);
  return {
    ...top,
    chartOrientation: section?.chartOrientation === 'horizontal' ? 'horizontal' : 'vertical',
    xAxis: axis('xAxis'),
    yAxis: axis('yAxis'),
  };
}
