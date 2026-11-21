/**
 * The colour maths of v12's set labels (`vennRenderer.ts:120, :163-164`): khroma's `isDark` of
 * the background and its `lighten` / `darken` of a circle's colour by 30 HSL points, with core's
 * khroma HSL steps.
 */
import { hslToRgb, luminance, rgbToHsl, shiftHsl, type Rgba } from '@mermaid-js/core/theme';

/** khroma's `lighten(c, dl)` (`darken` for a negative `dl`): lightness moved, clamped 0–100. */
export const shiftLightness = (c: Rgba, dl: number): Rgba =>
  hslToRgb(shiftHsl(rgbToHsl(c), 0, dl), c[3]);

/** khroma's `isDark`: relative luminance below one half. */
export const isDark = (c: Rgba): boolean => luminance(c) < 0.5;
