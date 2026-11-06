/**
 * The `radar` options the layout reads, checked (D356: never NaN, warn once). The config
 * resolver does not check value types, so a directive can set `"width": "wide"`. Each key is
 * read as the other ports read a length: a number, or a numeric string as its number, inside the
 * key's schema range. Anything else falls back to the schema default with one
 * `RADAR_CONFIG_INVALID` warning per key.
 */
import type { Warning } from '@mermaid-js/core';
import type { RadarDiagramConfig } from '@mermaid-js/core/config';
import { radarConfigDefaults } from './generated/config-defaults.ts';

export const RADAR_CONFIG_INVALID = 'RADAR_CONFIG_INVALID';

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

/** Each key's schema range, `[minimum, maximum]`, and how a warning names it. */
const RANGES: Readonly<Record<keyof RadarLayoutConfig, readonly [number, number, string]>> = {
  width: [1, Infinity, 'a number of 1 or more'],
  height: [1, Infinity, 'a number of 1 or more'],
  marginTop: [0, Infinity, 'a number of 0 or more'],
  marginRight: [0, Infinity, 'a number of 0 or more'],
  marginBottom: [0, Infinity, 'a number of 0 or more'],
  marginLeft: [0, Infinity, 'a number of 0 or more'],
  axisScaleFactor: [0, Infinity, 'a number of 0 or more'],
  axisLabelFactor: [0, Infinity, 'a number of 0 or more'],
  curveTension: [0, 1, 'a number from 0 to 1'],
};

const DEFAULTS = radarConfigDefaults as RadarLayoutConfig;

/** A finite number, or a string that reads as one; else undefined. */
function configNumber(value: unknown): number | undefined {
  let n = Number.NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && value.trim() !== '') n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const shown = (value: unknown): string =>
  typeof value === 'string' ? `"${value}"` : String(JSON.stringify(value));

/** The layout's options from the resolved `radar` section, each checked. */
export function radarLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn?: (w: Warning) => void
): RadarLayoutConfig {
  const out = { ...DEFAULTS };
  const given = section ?? {};
  for (const key of Object.keys(RANGES) as (keyof RadarLayoutConfig)[]) {
    if (!Object.hasOwn(given, key) || given[key] === undefined) continue;
    const [lo, hi, wants] = RANGES[key];
    const n = configNumber(given[key]);
    if (n !== undefined && n >= lo && n <= hi) out[key] = n;
    else
      warn?.({
        code: RADAR_CONFIG_INVALID,
        message: `radar.${key} is ${shown(given[key])}, not ${wants}; using the default ${DEFAULTS[key]}`,
      });
  }
  return out;
}
