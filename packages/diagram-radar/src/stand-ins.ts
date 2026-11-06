/**
 * Stand-ins for what T5 (#449) wires up (spec #422 §Integration). Delete this module in T5.
 *
 * The `radar` config keys are `pending`: T5 makes them `honoured` and generates
 * `generated/config-defaults.ts` from the schema. Until then the defaults are v12's
 * (`config.schema.yaml` `RadarDiagramConfig`), and a set value is read when it is a number in
 * the key's schema range. (The ten `radar*` theme variables are the plugin's theme table, #448.)
 */
import type { RadarDiagramConfig } from '@mermaid-js/core/config';

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
