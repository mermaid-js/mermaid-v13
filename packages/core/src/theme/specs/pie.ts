/**
 * The pie slot colours `pie1`–`pie12` and text colours of each built-in theme (#325), as rules
 * that replace the shared ones (`LIGHT_RULES` carries `base`'s). v12 12.2.0's resolved
 * `getThemeVariables()` is the oracle (`packages/conformance/src/pie/theme.spec.ts`). A slot
 * v12 derives by lightness alone (khroma `darken`) stays a rule, so it follows the theme's base
 * colours; a hue turn, or a slot v12 takes from its `cScale`, is v12's resolved value, since
 * the DSL has no hue turn and rules cannot read a palette.
 */
import type { ThemeRuleTable } from '../spec.ts';
import { TAILWIND_300 } from './palettes.ts';

/** `pie1`–`pie12` from twelve rules; `undefined` keeps the shared rule. */
function slots(rules: readonly (string | undefined)[]): ThemeRuleTable {
  const out: Record<string, string> = {};
  rules.forEach((r, i) => {
    if (r !== undefined) out[`pie${i + 1}`] = r;
  });
  return out;
}

/** v12 draws titles and legends in `taskTextDarkColor` (or `mainContrastColor`). */
const titles = (colour: string): ThemeRuleTable => ({
  pieTitleTextColor: colour,
  pieLegendTextColor: colour,
});

/**
 * v12 `theme-default.js`: tertiary −40, secondary −30, tertiary −20, then hue turns. `pie3` and
 * `pie6` are v12's values: v12 darkens its unrounded HSL tertiary colour, which lands a few steps
 * off the hex one.
 */
export const PIE_DEFAULT: ThemeRuleTable = {
  ...slots([
    undefined,
    undefined,
    '#b5ff20',
    undefined,
    'darkenHsl(secondaryColor, 30%)',
    '#d7ff86',
    '#ff86ff',
    '#20ffff',
    '#ff2020',
    '#ff20ff',
    '#20ff8f',
    '#ff5353',
  ]),
  ...titles('black'),
};

/** v12 `theme-forest.js`: primary and secondary −30, then hue turns. */
export const PIE_FOREST: ThemeRuleTable = slots([
  undefined,
  undefined,
  undefined,
  'darkenHsl(primaryColor, 30%)',
  'darkenHsl(secondaryColor, 30%)',
  '#33b42f',
  '#70d990',
  '#d99070',
  '#98cde4',
  '#1a6330',
  '#63301a',
  '#1a4d63',
]);

/**
 * v12 `theme-dark.js` sets `pie<i>` to `cScale<i>`, so slot 1 is `cScale1`, and leaves `pie12`
 * unset; v13 gives it `cScale0`, as `neutral` has (D228).
 */
export const PIE_DARK: ThemeRuleTable = {
  ...slots([
    '#0b0000',
    '#4d1037',
    '#3f5258',
    '#4f2f1b',
    '#6e0a0a',
    '#3b0048',
    '#995a01',
    '#154706',
    '#161722',
    '#00296f',
    '#01629c',
    '#1f2020',
  ]),
  ...titles('lightgrey'),
};

/** v12 `theme-neutral.js`: `pie<i>` is `cScale<i>`, `pie12` is `cScale0`. */
export const PIE_NEUTRAL: ThemeRuleTable = {
  ...slots([
    '#f4f4f4',
    '#555555',
    '#bbbbbb',
    '#777777',
    '#999999',
    '#dddddd',
    '#ffffff',
    '#dddddd',
    '#bbbbbb',
    '#999999',
    '#777777',
    '#555555',
  ]),
  ...titles('#333333'),
};

/**
 * v12 `theme-redux.js` and `theme-neo.js`: base's formulas, applied before v12 settles the
 * theme's own base colours, so every slot is its resolved value.
 */
export const PIE_REDUX: ThemeRuleTable = slots([
  '#ececfe',
  '#e9e9f1',
  '#ffffff',
  '#bcbcfb',
  '#cacadd',
  '#fcfccf',
  '#fbbcfb',
  '#bcfbfb',
  '#feecec',
  '#f98bf9',
  '#8bf9f9',
  '#fbbcbc',
]);

/**
 * v12 `theme-redux-dark.js` and `theme-neo-dark.js`: base's formulas. `pie5` is v12's value,
 * since v12 darkens the unrounded HSL secondary colour, which lands one step off the hex one.
 */
export const PIE_REDUX_DARK: ThemeRuleTable = slots([
  undefined,
  undefined,
  undefined,
  undefined,
  '#2e3030',
  undefined,
  '#060606',
  '#060606',
  '#201f20',
  '#000000',
  '#000000',
  '#060606',
]);

/** v12 `theme-redux-color.js` and `theme-redux-dark-color.js`: `pie<i+1>` is `cScale<i>`. */
export const PIE_REDUX_COLOR: ThemeRuleTable = slots(TAILWIND_300);
