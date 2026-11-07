/**
 * The rules the lazily loaded themes derive their `cScale`, `cScaleInv` and `cScaleLabel` with
 * (D258), and their git palettes (D267), kept out of `palettes.ts` so the default theme's static
 * chunk does not carry them.
 */
import type { ThemeRuleTable } from '../spec.ts';
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

/**
 * `gitBranchLabel` of `theme-forest.js` and `theme-dark.js`: v12's `labelTextColor`, inverted in
 * slots 0 and 3. Both set `labelTextColor` themselves before the labels (forest to its label ink
 * `scaleLabelColor`, dark to its `mainContrastColor`), so `label` is that rule.
 */
export const classicGitLabels = (label: string): readonly string[] =>
  paletteSlots((i) => (i === 0 || i === 3 ? `invert(${label})` : label), 8);

/**
 * `git` and `gitInv` where v12 derives a slot without reading the author's `git<n>` first
 * (`theme-dark.js`, `theme-neutral.js`): each rule, and its inverse.
 */
export const fixedGit = (
  git: readonly string[]
): { readonly git: readonly string[]; readonly gitInv: readonly string[] } => ({
  git,
  gitInv: git.map((c) => `invert(${c})`),
});

/**
 * The colours v12 starts its `git0`–`git7` from (D267): the primary, secondary and tertiary
 * colours, then the primary turned by −30, −60, −90, 60 and 120 degrees. Each argument is a rule.
 */
export const gitSources = (p: string, s: string, t: string): readonly string[] => [
  p,
  s,
  t,
  ...[-30, -60, -90, 60, 120].map((h) => `adjustHue(${p}, ${h})`),
];

/**
 * v12's `git`, `gitInv` and `gitBranchLabel` (`theme-base.js` and the themes that copy it): each
 * source darkened by 25 points of HSL lightness (`lightenHsl` under `darkMode`), the inverse of
 * that step, and one label rule in every slot (v12's `labelTextColor`, the label ink
 * `scaleLabelColor`, D334). v12 steps an author's `git<n>` too before it inverts
 * it, then draws the author's colour as given; `ifSet` keeps both.
 */
export const gitPalettes = (
  sources: readonly string[],
  step = 'darkenHsl',
  label = 'scaleLabelColor'
): Readonly<Record<'git' | 'gitInv' | 'gitBranchLabel', readonly string[]>> => ({
  git: sources.map((c) => `${step}(${c}, 25%)`),
  gitInv: sources.map((c, i) => `invert(${step}(ifSet(git${i}, ${c}), 25%))`),
  gitBranchLabel: sources.map(() => label),
});

/**
 * The badge and the callout border (D332) as one v12 theme derives gitGraph's commit label
 * colours and tag border from them (D267): the author's `secondaryTextColor`, else v12's
 * `invert(secondaryColor)` (`text`); `background`; the author's `primaryBorderColor`, else v12's
 * resolved border (`border`, a khroma saturation step the DSL has no function for). An author's
 * `tagBorder` comes first (gitGraph's table).
 */
export const gitLabelRules = (
  text: string,
  border: string,
  background = 'secondaryColor'
): ThemeRuleTable => ({
  badgeTextColor: `ifSet(secondaryTextColor, ${text})`,
  badgeBkg: background,
  calloutBorder: `ifSet(primaryBorderColor, ${border})`,
});
