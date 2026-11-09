/**
 * The `eventmodeling` options, checked (D226: never NaN, one warning per key), as packet's and
 * cynefin's (D366). The config resolver does not check value types or the schema's minimums, so
 * a directive can set `"padding": -5` or `"padding": "wide"`. The layout reads `padding` (#604),
 * the renderer `useMaxWidth` (#606); T5 (#611) marks them honoured.
 *
 * `padding` is a number, or a numeric string as its number (v12 passed it on as given), of 0 or
 * more, small enough that the bounds it pads stay finite (`PADDING_HEADROOM`); anything else is
 * v12's 30 with one `EVENTMODELING_CONFIG_INVALID`. `useMaxWidth` is a boolean, else true with
 * one (`eventModelingUseMaxWidth`, read by the renderer).
 */
import type { Warning } from '@mermaid-js/core';
import type { EventModelingDiagramConfig } from '@mermaid-js/core/config';
import { EVENTMODELING_CONFIG_INVALID } from './codes.ts';
import { EVENTMODELING_METRICS, PADDING_HEADROOM } from './layout/metrics.ts';

export interface EventModelingConfig {
  /** The margin around what is drawn, px. */
  readonly padding: number;
}

/** The options from the resolved `eventmodeling` section, each checked. */
export function eventModelingConfig(
  section: Readonly<EventModelingDiagramConfig> | undefined,
  warn: (w: Warning) => void
): EventModelingConfig {
  const fallback = EVENTMODELING_METRICS.padding;
  // Typed as a number, but a directive can write anything.
  const given: unknown = section?.padding;
  if (given === undefined) return { padding: fallback };
  let n = Number.NaN;
  if (typeof given === 'number') n = given;
  else if (typeof given === 'string' && given.trim() !== '') n = Number(given);
  if (n >= 0 && Number.isFinite(n * PADDING_HEADROOM)) return { padding: n };
  warn({
    code: EVENTMODELING_CONFIG_INVALID,
    message: `Ignored eventmodeling.padding: ${JSON.stringify(given)} is not a number of 0 or more that keeps the diagram finite; using ${fallback}`,
    path: 'eventmodeling.padding',
  });
  return { padding: fallback };
}

/**
 * `useMaxWidth` (default true, v12's `setupGraphViewbox`): a boolean as given; anything else
 * (a directive can write `"useMaxWidth": "no"`) is the default with one
 * `EVENTMODELING_CONFIG_INVALID` (D226).
 */
export function eventModelingUseMaxWidth(
  section: Readonly<Pick<EventModelingDiagramConfig, 'useMaxWidth'>> | undefined,
  warn: (w: Warning) => void
): boolean {
  const given: unknown = section?.useMaxWidth;
  if (given === undefined || typeof given === 'boolean') return given ?? true;
  warn({
    code: EVENTMODELING_CONFIG_INVALID,
    message: `Ignored eventmodeling.useMaxWidth: ${JSON.stringify(given)} is not true or false; using true`,
    path: 'eventmodeling.useMaxWidth',
  });
  return true;
}
