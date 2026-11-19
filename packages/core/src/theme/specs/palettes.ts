/**
 * The redux colour palettes, from v12 `theme-redux-color.js` and `theme-redux-dark-color.js`
 * (D151). Plain data, shared by the two colour themes; with the series palette helper (D332).
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

/**
 * A theme's `seriesColorArray` (D332), a shared input that names no diagram: entries 0–11 are its
 * series colours and 12–19 its series tints (paler fills, darker in a dark theme). A diagram reads
 * a slot as the theme wrote the entry, CSS included, so an entry that is a rule over the base
 * colours follows them as the rule does. The values are v12 12.2.0's, which
 * the oracle specs check (`packages/conformance/src/{pie,journey}/theme.spec.ts`).
 *
 * `entries` is the entries space-separated (a list costs the always-loaded core more), so an
 * entry that is a rule is written without spaces.
 */
export const series = (entries: string): readonly string[] => entries.split(' ');

/**
 * The series tints, slots 12–19 (`fillType0`–`fillType7`): the primary and secondary colours and
 * their ±64° and 128° turns, which every v12 classic theme recomputes from the base colours, so
 * each follows an override of its base colour (D656).
 */
export const SERIES_TINTS =
  'primaryColor secondaryColor adjustHue(primaryColor,64) adjustHue(secondaryColor,64) adjustHue(primaryColor,-64) ' +
  'adjustHue(secondaryColor,-64) adjustHue(primaryColor,128) adjustHue(secondaryColor,128)';

/**
 * The series entries a theme leaves out (D332): v12 `theme-base.js`'s pie and journey colours,
 * derived from the base colours. Slots 0–11 are its `pie1`–`pie12` (the three base colours, khroma
 * `darken` by 10, then hue turns of `primaryColor`), 12–19 its `fillType0`–`fillType7`
 * (`SERIES_TINTS`). So a theme with only base colours and a family draws every series diagram, its
 * seed pair being `primaryColor` and `secondaryColor`. Every built-in theme writes all twenty
 * entries itself.
 */
export const BASE_SERIES: readonly string[] = series(
  'primaryColor secondaryColor tertiaryColor darkenHsl(primaryColor,10%) darkenHsl(secondaryColor,10%) darkenHsl(tertiaryColor,10%) ' +
    'darkenHsl(adjustHue(primaryColor,60),10%) darkenHsl(adjustHue(primaryColor,-60),10%) adjustHue(primaryColor,120) ' +
    'darkenHsl(adjustHue(primaryColor,60),20%) darkenHsl(adjustHue(primaryColor,-60),20%) darkenHsl(adjustHue(primaryColor,120),10%) ' +
    SERIES_TINTS
);

/**
 * The chart series palette `plotColorArray` (D381), a shared input that names no diagram: v12
 * theme-base's ten chart colours, as written. `base`, the redux themes and `neo` carry it as v12
 * does, and a theme that leaves the palette out reads it (D545).
 */
export const BASE_PLOT: readonly string[] = series(
  '#FFF4DD #FFD8B1 #FFA07A #ECEFF1 #D6DBDF #C3E0A8 #FFB6A4 #FFD74D #738FA7 #FFFFF0'
);

/** One palette entry per slot (12, v12's `THEME_COLOR_LIMIT`, D258; 8 for the git palettes). */
export const paletteSlots = (entry: (i: number) => string, length = 12): readonly string[] =>
  Array.from({ length }, (_, i) => entry(i));

/**
 * v12 `theme-base.js`'s `secondaryColor`, a hue turn of `primaryColor` unless the author sets it:
 * what the shared rules (`LIGHT_RULES`) derive the commit labels from (the text is its inverse),
 * as `neo` and the light redux themes do.
 */
export const BASE_SECONDARY = 'ifSet(secondaryColor, adjustHue(primaryColor, -120))';

/** `cScaleInv` as v12 derives it from a fixed `cScale`: `invert(cScale<n>)`. */
export const INVERTED_SCALE = paletteSlots((i) => `invert(cScale${i})`);

/**
 * `cScaleLabel` as most v12 themes derive it: v12's `scaleLabelColor`, a shared label ink, not
 * a sequence variable (D334).
 */
export const LABEL_SCALE = paletteSlots(() => 'scaleLabelColor');
