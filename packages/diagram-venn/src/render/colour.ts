/**
 * The colour maths of v12's set labels (`vennRenderer.ts:120, :163-164`): khroma's `isDark` of
 * the background and its `lighten` / `darken` of a circle's colour by 30 HSL points. Core's HSL
 * steps are not exported (their export would grow the CDN core closure, R-PERF-8), so the three
 * conversions are here, as core's `theme/color.ts` writes them (khroma's channels, rounded to 10
 * decimals as khroma writes them).
 */
import { luminance, type Rgba } from '@mermaid-js/core/theme';

type Hsl = readonly [number, number, number];

const round10 = (n: number): number => Math.round(n * 1e10) / 1e10;

/** `c` as khroma's HSL channels: hue in degrees, saturation and lightness 0–100. */
function rgbToHsl(c: Rgba): Hsl {
  const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}

/** HSL channels back to sRGB, as a browser converts `hsl()`. */
function hslToRgb(c: Hsl, alpha: number): Rgba {
  const lt = c[2] / 100;
  const k = (c[1] / 100) * Math.min(lt, 1 - lt);
  const hue = c[0] / 30;
  const [x, y, z] = [0, 8, 4].map((o) => {
    const t = (o + hue) % 12;
    return (lt - k * Math.max(-1, Math.min(t - 3, 9 - t, 1))) * 255;
  }) as [number, number, number];
  return [x, y, z, alpha];
}

/** khroma's `lighten(c, dl)` (`darken` for a negative `dl`): lightness moved, clamped 0–100. */
export function shiftLightness(c: Rgba, dl: number): Rgba {
  const [h, s, l] = rgbToHsl(c);
  return hslToRgb([round10(h), round10(s), round10(Math.min(Math.max(l + dl, 0), 100))], c[3]);
}

/** khroma's `isDark`: relative luminance below one half. */
export const isDark = (c: Rgba): boolean => luminance(c) < 0.5;
