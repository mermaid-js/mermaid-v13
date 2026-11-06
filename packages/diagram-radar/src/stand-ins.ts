/**
 * Stand-ins for what T5 (#449) wires up (spec #422 §Integration). Delete this module in T5.
 *
 * - The ten `radar*` theme variables do not exist yet: they go in the package's family-keyed
 *   `DiagramPlugin.theme` table from #414 T0a (D322, D331, D335), never in core's vocabulary
 *   (R-PERF-8). Until then every read takes v12's value (`theme-default.js:342-354`, the same in
 *   every theme that has a block); `radarAxisColor` is the rule `lineColor` (D351).
 * - The `radar` config keys are `pending`: T5 makes them `honoured` and generates
 *   `generated/config-defaults.ts` from the schema. Until then the defaults are v12's
 *   (`config.schema.yaml` `RadarDiagramConfig`), and a set value is read when it is a number in
 *   the key's schema range.
 */
import type { RadarDiagramConfig } from '@mermaid-js/core/config';

/** v12's `radar` theme block (spec #422 §Integration table), by its v13 flat name. */
const RADAR_THEME_DEFAULTS = {
  /** A colour rule, not a literal: the theme's `lineColor` (D351). */
  radarAxisColor: 'lineColor',
  radarAxisStrokeWidth: 2,
  radarAxisLabelFontSize: 12,
  radarCurveOpacity: 0.5,
  radarCurveStrokeWidth: 2,
  radarGraticuleColor: '#DEDEDE',
  radarGraticuleOpacity: 0.3,
  radarGraticuleStrokeWidth: 1,
  /** v12 declares it and draws a fixed 12 px swatch; v13 reads it (D359). */
  radarLegendBoxSize: 12,
  radarLegendFontSize: 12,
} as const;

type NumberVariable = {
  [K in keyof typeof RADAR_THEME_DEFAULTS]: (typeof RADAR_THEME_DEFAULTS)[K] extends number
    ? K
    : never;
}[keyof typeof RADAR_THEME_DEFAULTS];

/** A radar length or opacity variable: v12's value until the theme table lands (T5). */
export function radarThemeNumber(name: NumberVariable): number {
  return RADAR_THEME_DEFAULTS[name];
}

/** The `radar` options the layout reads, every one set. */
export type RadarLayoutConfig = Required<
  Pick<
    RadarDiagramConfig,
    | 'width'
    | 'height'
    | 'marginTop'
    | 'marginRight'
    | 'marginBottom'
    | 'marginLeft'
    | 'axisScaleFactor'
    | 'axisLabelFactor'
    | 'curveTension'
  >
>;

/** v12's `radar` defaults (`config.schema.yaml` `RadarDiagramConfig`). */
const RADAR_CONFIG_DEFAULTS: RadarLayoutConfig = {
  width: 600,
  height: 600,
  marginTop: 50,
  marginRight: 50,
  marginBottom: 50,
  marginLeft: 50,
  axisScaleFactor: 1,
  axisLabelFactor: 1.05,
  curveTension: 0.17,
};

/** Each key's schema range: `[minimum, maximum]`. */
const RANGES: Readonly<Record<keyof RadarLayoutConfig, readonly [number, number]>> = {
  width: [1, Infinity],
  height: [1, Infinity],
  marginTop: [0, Infinity],
  marginRight: [0, Infinity],
  marginBottom: [0, Infinity],
  marginLeft: [0, Infinity],
  axisScaleFactor: [0, Infinity],
  axisLabelFactor: [0, Infinity],
  curveTension: [0, 1],
};

/**
 * The layout's options from the resolved `radar` section: each key a finite number in its
 * schema range, else v12's default (never NaN, D356). T5 replaces the defaults with the
 * generated ones and decides whether a bad value warns.
 */
export function radarLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined
): RadarLayoutConfig {
  const out = { ...RADAR_CONFIG_DEFAULTS };
  for (const key of Object.keys(RANGES) as (keyof RadarLayoutConfig)[]) {
    const v = section?.[key];
    const [lo, hi] = RANGES[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi) out[key] = v;
  }
  return out;
}
