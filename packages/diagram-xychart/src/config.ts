/**
 * The `xyChart` options, read here for the layout (and the renderer). Until T5 (#513) generates
 * `generated/config-defaults.ts` and makes the keys `honoured`, the defaults are v12's
 * (`config.schema.yaml` `XYChartConfig`, `XYChartAxisConfig`), copied by hand.
 *
 * Values are taken as v12 took them (`cleanAndMerge` checks no schema range, story 6, D383):
 * any finite number (or numeric string, as the other ports read a length) for a number key, any
 * boolean for a boolean key; anything else falls back to the default (D383: never NaN), and T5
 * decides whether that warns. v12's own rules stay: a `labelRotation` outside ±90 is 0
 * (`axis/baseAxis.ts:37-40`), and `chartOrientation` is `horizontal` only as written.
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

type Section = Readonly<Record<string, unknown>> | undefined;

/** A finite number, or a string that reads as one; else undefined. */
export function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** `defaults` with each key of `given` that has the default's type taken. */
function read<T extends object>(defaults: T, given: Section): T {
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  if (given === undefined || typeof given !== 'object') return out as T;
  for (const key of Object.keys(defaults) as (keyof T & string)[]) {
    const v = given[key];
    const d = defaults[key];
    if (typeof d === 'boolean' && typeof v === 'boolean') out[key] = v;
    else if (typeof d === 'number') {
      const n = configNumber(v);
      if (n !== undefined) out[key] = n;
    }
  }
  return out as T;
}

/** v12's rotation rule: inside ±90 as given, else 0 (`axis/baseAxis.ts:37-40`). */
const rotation = (deg: number): number => (deg >= -90 && deg <= 90 ? deg : 0);

/** The layout's options from the resolved `xyChart` section. */
export function xyChartOptions(section: Section): XyChartOptions {
  const top = read(DEFAULTS, section);
  const axis = (key: 'xAxis' | 'yAxis'): XyChartAxisOptions => {
    const options = read(AXIS_DEFAULTS, section?.[key] as Section);
    return { ...options, labelRotation: rotation(options.labelRotation) };
  };
  return {
    ...top,
    chartOrientation: section?.chartOrientation === 'horizontal' ? 'horizontal' : 'vertical',
    xAxis: axis('xAxis'),
    yAxis: axis('yAxis'),
  };
}
