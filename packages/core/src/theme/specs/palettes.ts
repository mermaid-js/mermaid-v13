/**
 * The redux colour palettes, from v12 `theme-redux-color.js` and `theme-redux-dark-color.js`
 * (D151). Plain data, shared by the two colour themes; with the redux family's rules and the series
 * palette helper (D332).
 */
import type { ThemeRuleTable } from '../spec.ts';

/**
 * Colours the redux family derives differently from the classic themes (D152). Shared by the
 * redux and neo specs. ER rows have no fill of their own in v12 neo, so they show the
 * entity's; the zero circle takes the node fill (`zero_or_one_neo`). Kept in this module, which
 * every theme loads, so it adds no chunk of its own to the default theme's closure (D161).
 */
export const REDUX_RULES: ThemeRuleTable = {
  rowOdd: 'mainBkg',
  rowEven: 'mainBkg',
  erMarkerFill: 'mainBkg',
};

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
