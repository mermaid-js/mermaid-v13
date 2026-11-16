/**
 * The `radar` options, read here for the layout and the renderer. The layout's are checked
 * (D356: never NaN, warn once). The config resolver does not check value types, so a
 * directive can set `"width": "wide"`. Each key is read as the other ports read a length: a
 * number, or a numeric string as its number, inside the key's schema range. Anything else
 * falls back to the schema default with one `RADAR_CONFIG_INVALID` warning per key.
 */
import type { Warning } from '@mermaid-js/core';
import type { RadarDiagramConfig } from '@mermaid-js/core/config';
import { configNumber, shownValue as shown, useMaxWidth } from '@mermaid-js/shared/config/readers';
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

/** A key's schema range and how a warning names it. */
interface Range {
  readonly min: number;
  readonly max: number;
  readonly wants: string;
}

const AT_LEAST_1: Range = { min: 1, max: Infinity, wants: 'a number of 1 or more' };
const AT_LEAST_0: Range = { min: 0, max: Infinity, wants: 'a number of 0 or more' };

/** Each key's schema range. */
const RANGES: Readonly<Record<keyof RadarLayoutConfig, Range>> = {
  width: AT_LEAST_1,
  height: AT_LEAST_1,
  marginTop: AT_LEAST_0,
  marginRight: AT_LEAST_0,
  marginBottom: AT_LEAST_0,
  marginLeft: AT_LEAST_0,
  axisScaleFactor: AT_LEAST_0,
  axisLabelFactor: AT_LEAST_0,
  curveTension: { min: 0, max: 1, wants: 'a number from 0 to 1' },
};

const DEFAULTS = radarConfigDefaults as RadarLayoutConfig;

/** The layout's options from the resolved `radar` section, each checked. */
export function radarLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn: (w: Warning) => void
): RadarLayoutConfig {
  const out = { ...DEFAULTS };
  const given = section ?? {};
  for (const key of Object.keys(RANGES) as (keyof RadarLayoutConfig)[]) {
    if (!Object.hasOwn(given, key) || given[key] === undefined) continue;
    const { min, max, wants } = RANGES[key];
    const n = configNumber(given[key]);
    if (n !== undefined && n >= min && n <= max) out[key] = n;
    else
      warn({
        code: RADAR_CONFIG_INVALID,
        message: `radar.${key} is ${shown(given[key])}, not ${wants}; using the default ${DEFAULTS[key]}`,
      });
  }
  return out;
}

/** `radar.useMaxWidth`, for the renderer: anything but `false` scales to the container. */
export function radarUseMaxWidth(
  section: Readonly<Pick<RadarDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  return useMaxWidth(section?.useMaxWidth);
}
