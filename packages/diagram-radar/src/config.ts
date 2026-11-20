/**
 * The `radar` options, read here for the layout and the renderer. The layout's are checked
 * (D356: never NaN, warn once). The config resolver does not check value types, so a
 * directive can set `"width": "wide"`. Each key is read as the other ports read a length: a
 * number, or a numeric string as its number, inside the key's schema range. Anything else
 * falls back to the schema default with one `RADAR_CONFIG_INVALID` warning per key.
 */
import type { Warning } from '@mermaid-js/core';
import type { RadarDiagramConfig } from '@mermaid-js/core/config';
import { configRanges, NON_NEGATIVE, useMaxWidth } from '@mermaid-js/shared/config/readers';
import type { ConfigRange } from '@mermaid-js/shared/config/readers';
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

const AT_LEAST_1: ConfigRange = { min: 1, wants: 'a number of 1 or more' };

/** Each key's schema range. */
const RANGES: Readonly<Record<keyof RadarLayoutConfig, ConfigRange>> = {
  width: AT_LEAST_1,
  height: AT_LEAST_1,
  marginTop: NON_NEGATIVE,
  marginRight: NON_NEGATIVE,
  marginBottom: NON_NEGATIVE,
  marginLeft: NON_NEGATIVE,
  axisScaleFactor: NON_NEGATIVE,
  axisLabelFactor: NON_NEGATIVE,
  curveTension: { min: 0, max: 1, wants: 'a number from 0 to 1' },
};

const DEFAULTS = radarConfigDefaults as RadarLayoutConfig;

/** The layout's options from the resolved `radar` section, each checked. */
export function radarLayoutConfig(
  section: Readonly<Record<string, unknown>> | undefined,
  warn: (w: Warning) => void
): RadarLayoutConfig {
  const out = { ...DEFAULTS };
  const number = configRanges('radar', RADAR_CONFIG_INVALID, section, warn);
  for (const key of Object.keys(RANGES) as (keyof RadarLayoutConfig)[])
    out[key] = number(key, DEFAULTS[key], RANGES[key]);
  return out;
}

/** `radar.useMaxWidth`, for the renderer: anything but `false` scales to the container. */
export function radarUseMaxWidth(
  section: Readonly<Pick<RadarDiagramConfig, 'useMaxWidth'>> | undefined
): boolean {
  return useMaxWidth(section?.useMaxWidth);
}
