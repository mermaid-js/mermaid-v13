/**
 * The `cynefin` options the layout reads, checked (D366, D226: never NaN, warn once). v12 never
 * checked the schema's ranges at runtime, so `width: -100` drew negative rects and `NaN` reached
 * path data. A `width`, `height` or `padding` that is not a finite number in range falls back
 * to its default; `boundaryAmplitude` clamps to [0, 50] (a value that is not a number at all
 * takes the default); a `seed` that is not a finite number counts as 0. Each gets one
 * `CYNEFIN_CONFIG_INVALID` warning per render. `showDomainDescriptions` is read as v12 read it.
 */
import type { Warning } from '@mermaid-js/core';
import { CANVAS, CYNEFIN_DEFAULTS as D } from './metrics.ts';

/** The options, each valid. */
export interface CynefinOptions {
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly showDomainDescriptions: boolean;
  readonly boundaryAmplitude: number;
  readonly seed: number;
}

const CODE = 'CYNEFIN_CONFIG_INVALID';

function shown(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}

/** The layout's options from the resolved `cynefin` section, each checked. */
export function cynefinOptions(
  section: Readonly<Record<string, unknown>> | undefined,
  warn: (w: Warning) => void
): CynefinOptions {
  const given = section ?? {};
  /** One warning: `key`'s value is not `wants`, so `used` is drawn (the default, or clamped). */
  const invalid = (key: string, wants: string, used: number, clamped = false): void =>
    warn({
      code: CODE,
      message: `cynefin.${key} is ${shown(given[key])}, not ${wants}; using ${clamped ? '' : 'the default '}${used}`,
      path: `cynefin.${key}`,
    });

  /**
   * A size: a finite number of at least `min` whose canvas, `size + 2 · padding` on both axes,
   * stays finite even scaled by the layout's largest factor (`CANVAS.headroom`), so no sum or
   * product the layout and its bounds compute overflows to Infinity or NaN (D366).
   */
  const size = (
    key: 'width' | 'height' | 'padding',
    min: number,
    fits: (v: number) => boolean
  ): number => {
    const v = given[key];
    if (v === undefined) return D[key];
    const wants = `a number of ${min} or more`;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min) invalid(key, wants, D[key]);
    else if (!fits(v)) invalid(key, `${wants} that keeps the canvas finite`, D[key]);
    else return v;
    return D[key];
  };
  const fits = (w: number, h: number, p: number): boolean =>
    Number.isFinite((w + 2 * p) * CANVAS.headroom) &&
    Number.isFinite((h + 2 * p) * CANVAS.headroom);
  const width = size('width', D.minSize, (v) => fits(v, D.height, D.padding));
  const height = size('height', D.minSize, (v) => fits(D.width, v, D.padding));
  const padding = size('padding', D.minPadding, (v) => fits(width, height, v));

  const amplitude = (): number => {
    const v = given.boundaryAmplitude;
    if (v === undefined) return D.boundaryAmplitude;
    const wants = `a number from ${D.minAmplitude} to ${D.maxAmplitude}`;
    if (typeof v !== 'number' || Number.isNaN(v)) {
      invalid('boundaryAmplitude', wants, D.boundaryAmplitude);
      return D.boundaryAmplitude;
    }
    const clamped = Math.min(D.maxAmplitude, Math.max(D.minAmplitude, v));
    if (clamped !== v) invalid('boundaryAmplitude', wants, clamped, true);
    return clamped;
  };

  const seed = (): number => {
    const v = given.seed;
    if (v === undefined) return D.seed;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    invalid('seed', 'a finite number', D.seed);
    return D.seed;
  };

  const show = given.showDomainDescriptions;
  return {
    width,
    height,
    padding,
    // v12 tests it for truth, so only an absent key takes the default.
    showDomainDescriptions: show === undefined ? D.showDomainDescriptions : Boolean(show),
    boundaryAmplitude: amplitude(),
    seed: seed(),
  };
}
