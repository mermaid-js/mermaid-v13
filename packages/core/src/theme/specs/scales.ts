/**
 * The rules the lazily loaded themes derive their `cScale`, `cScaleInv` and `cScaleLabel` with
 * (D258), kept out of `palettes.ts` so the default theme's static chunk does not carry them.
 */
import { paletteSlots } from './palettes.ts';

/** v12's hue steps from the primary colour for slots 3–11 (khroma `adjust(…, { h })`). */
const HUE_STEPS = [30, 60, 90, 120, 150, 210, 270, 300, 330] as const;

/**
 * The colours v12 starts its `cScale` from: the primary, secondary and tertiary colours, then
 * the primary turned by each hue step. With `lightSlot8` slot 8 is also lightened by 150
 * (`adjust(…, { h: 210, l: 150 })`, base and the neo and redux themes), which keeps its hue.
 * Each argument is a rule.
 */
export function hueSources(
  lightSlot8: boolean,
  primary = 'primaryColor',
  secondary = 'secondaryColor',
  tertiary = 'tertiaryColor'
): readonly string[] {
  return [
    primary,
    secondary,
    tertiary,
    ...HUE_STEPS.map((h) =>
      h === 210 && lightSlot8
        ? `lightenHsl(adjustHue(${primary}, ${h}), 100%)`
        : `adjustHue(${primary}, ${h})`
    ),
  ];
}

/**
 * v12's derived `cScale` and `cScaleInv` (`theme-base.js` and the themes that copy it): each
 * source darkened by `step` points of HSL lightness, and its inverse (`invert`, or `inverse`).
 * v12 darkens an author's `cScale<n>` too before it derives the inverse, then draws the
 * author's colour as given; `ifSet` keeps both.
 */
export function darkenedScale(
  sources: readonly string[],
  step: number,
  inverse: (c: string) => string = (c) => `invert(${c})`
): { readonly cScale: readonly string[]; readonly cScaleInv: readonly string[] } {
  return {
    cScale: sources.map((c) => `darkenHsl(${c}, ${step}%)`),
    cScaleInv: sources.map((c, i) => inverse(`darkenHsl(ifSet(cScale${i}, ${c}), ${step}%)`)),
  };
}

/**
 * `theme-neo-dark.js` and `theme-redux-dark.js`: `secondaryColor` and `tertiaryColor` are
 * khroma steps from their own `#1f2020`, fixed when the theme is built.
 */
export const DARK_HUE_SOURCES = hueSources(
  true,
  'primaryColor',
  'ifSet(secondaryColor, lightenHsl(#1f2020, 16%))',
  'ifSet(tertiaryColor, adjustHue(#1f2020, -160))'
);

/**
 * `cScaleLabel` where v12 writes `scaleLabelColor || 'black'` under `darkMode` (`theme-dark.js`,
 * `theme-neutral.js`).
 */
export const darkModeLabels = (keep: Readonly<Record<number, string>> = {}): readonly string[] =>
  paletteSlots((i) => keep[i] ?? 'ifSet(scaleLabelColor, #000000)');
