/**
 * The redux colour palettes, from v12 `theme-redux-color.js` and `theme-redux-dark-color.js`
 * (D151). Plain data, shared by the two colour themes.
 */

/** `borderColorArray`: Tailwind-400, one per subgraph slot. */
export const TAILWIND_400: readonly string[] = [
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#22d3ee', // cyan
  '#4ade80', // green
  '#a78bfa', // violet
  '#f87171', // red
  '#facc15', // yellow
  '#818cf8', // indigo
  '#a3e635', // lime
  '#38bdf8', // sky
  '#fb7185', // rose
];

/** `bkgColorArray` of `redux-color`: Tailwind-50 in the same hue order. */
export const TAILWIND_50: readonly string[] = [
  '#fdf4ff',
  '#f0fdfa',
  '#fff7ed',
  '#ecfeff',
  '#f0fdf4',
  '#f5f3ff',
  '#fef2f2',
  '#fefce8',
  '#eef2ff',
  '#f7fee7',
  '#f0f9ff',
  '#fff1f2',
];

/** `cScale0`–`cScale11`: v12's fixed Tailwind-300 set (purple in slot 3, not cyan). */
export const TAILWIND_300: readonly string[] = [
  '#f4a8ff',
  '#46ecd5',
  '#ffb86a',
  '#dab2ff',
  '#7bf1a8',
  '#c4b4ff',
  '#ffa2a2',
  '#ffdf20',
  '#a3b3ff',
  '#bbf451',
  '#74d4ff',
  '#ffa1ad',
];

/** One palette entry per slot (12, v12's `THEME_COLOR_LIMIT`, D258). */
export const paletteSlots = (entry: (i: number) => string): readonly string[] =>
  Array.from({ length: 12 }, (_, i) => entry(i));

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

/** `theme-redux.js`: `mainBkg` darkened by `step` in every slot, and its inverse. */
export const mainBkgScale = (
  step: number
): { readonly cScale: readonly string[]; readonly cScaleInv: readonly string[] } => ({
  cScale: paletteSlots(() => `darkenHsl(mainBkg, ${step}%)`),
  cScaleInv: paletteSlots(() => `invert(darkenHsl(mainBkg, ${step}%))`),
});

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

/** `cScaleInv` as v12 derives it from a fixed `cScale`: `invert(cScale<n>)`. */
export const INVERTED_SCALE = paletteSlots((i) => `invert(cScale${i})`);

/** `cScaleLabel` as most v12 themes derive it: `labelTextColor` (v12 `scaleLabelColor`). */
export const LABEL_SCALE = paletteSlots(() => 'labelTextColor');

/** `cScaleLabel` where v12 writes `black` under `darkMode` (`theme-dark.js`, `theme-neutral.js`). */
export const darkModeLabels = (keep: Readonly<Record<number, string>> = {}): readonly string[] =>
  paletteSlots((i) => keep[i] ?? '#000000');
