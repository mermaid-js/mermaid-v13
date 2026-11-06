/**
 * `redux`: the monochrome redux theme, from v12 `theme-redux.js`. Its tokens (stroke width 2, radius 12)
 * are what makes every diagram type in redux look like one family (R-THEME-11).
 */
import type { ThemeRuleTable, ThemeSpec } from '../spec.ts';
import { fillTypes, LABEL_SCALE, paletteSlots, pieSlots, REDUX_RULES } from './palettes.ts';
import {
  NEO_ARROWHEADS,
  NEO_CLASS_MARKERS,
  NEO_SEQUENCE,
  REDUX_TIMELINE,
  REDUX_MINDMAP,
  REDUX_PADDING,
  TEXT_SIZES,
} from './geometry.ts';

/** `theme-redux.js`: `mainBkg` darkened by `step` in every slot, and its inverse. */
const mainBkgScale = (
  step: number
): { readonly cScale: readonly string[]; readonly cScaleInv: readonly string[] } => ({
  cScale: paletteSlots(() => `darkenHsl(mainBkg, ${step}%)`),
  cScaleInv: paletteSlots(() => `invert(darkenHsl(mainBkg, ${step}%))`),
});

/**
 * v12 `theme-redux.js`, `theme-redux-color.js` and `theme-neo.js` derive `git0`–`git7` from their
 * own constants (`#ECECFE`, `#E9E9F1`), not from `primaryColor` (D267): `gitSources` of those,
 * darkened by 25 (lightened under `darkMode`, which turns every slot white). Written out as data,
 * so the git builders stay in the lazily loaded `scales.ts`. `gitInv` inverts the step of the
 * author's `git<n>` or the source, as v12 does; branch labels are `labelTextColor` (black under
 * `darkMode`).
 */
const NEO_GIT_SOURCES = [
  '#ececfe',
  '#e9e9f1',
  'lightenHsl(adjustHue(#ececfe, 180), 5%)',
  'adjustHue(#ececfe, -30)',
  'adjustHue(#ececfe, -60)',
  'adjustHue(#ececfe, -90)',
  'adjustHue(#ececfe, 60)',
  'adjustHue(#ececfe, 120)',
];
const neoGitInv = (step: string): readonly string[] =>
  NEO_GIT_SOURCES.map((c, i) => `invert(${step}(ifSet(git${i}, ${c}), 25%))`);
export const NEO_GIT = {
  git: ['#7373f8', '#9b9bbf', '#f9f986', '#73b5f8', '#73f8f8', '#73f8b5', '#f873f8', '#f87373'],
  gitInv: neoGitInv('darkenHsl'),
  gitBranchLabel: NEO_GIT_SOURCES.map(() => 'labelTextColor'),
};
export const NEO_GIT_DARK_MODE = {
  git: NEO_GIT_SOURCES.map(() => '#ffffff'),
  gitInv: neoGitInv('lightenHsl'),
  gitBranchLabel: NEO_GIT_SOURCES.map(() => 'black'),
};
/**
 * v12 `theme-redux.js` and `theme-neo.js`: base's formulas, applied before v12 settles the
 * theme's own base colours, so every slot is its resolved value.
 */
export const PIE_REDUX: ThemeRuleTable = pieSlots([
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

const redux: ThemeSpec = {
  name: 'redux',
  dark: false,
  base: {
    primaryColor: '#cccccc',
    secondaryColor: '#cccccc',
    tertiaryColor: '#ffffff',
    background: '#ffffff',
    primaryTextColor: '#28253d',
    lineColor: '#000000',
    fontFamily: '"Recursive Variable", arial, sans-serif',
    fontSize: '14px',
  },
  tokens: {
    strokeWidth: 2,
    clusterStrokeWidth: 1,
    radius: 12,
    fontWeight: 600,
    spacing1: 4,
    spacing2: 8,
    spacing3: 16,
    ...NEO_ARROWHEADS,
    ...NEO_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...REDUX_PADDING,
    ...NEO_SEQUENCE,
    ...REDUX_TIMELINE,
    ...REDUX_MINDMAP,
    useGradient: false,
  },
  rules: { ...REDUX_RULES, ...PIE_REDUX },
  values: {
    // journey section fills, v12's resolved values (`fillTypes`)
    ...fillTypes('#ececfe #e9e9f1 #feecfd #f1e9f0 #ecfefd #e9f1f0 #feeeec #f1eae9'),
    // v12's hard drop shadow (insertLookDefs: dx/dy 4, no blur, 6% black) as a CSS filter.
    dropShadow: 'drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))',
    primaryBorderColor: '#28253d',
    mainBkg: '#ffffff',
    clusterBkg: '#f9f9fb',
    clusterBorder: '#bdbccc',
    // v12 pins both composite-state backgrounds (#192).
    compositeTitleBackground: '#f9f9fb',
    altBackground: '#f9f9fb',
    noteBkgColor: '#fff5ad',
    noteTextColor: '#28253d',
    noteBorderColor: '#facc15',
    errorBkgColor: '#ffffff',
    errorTextColor: '#000000',
    // v12 theme-redux*.js; off until a theme or the author turns it on (D182).
    gradientStart: '#0042eb',
    gradientStop: '#eb0042',
    // v12 derives the quadrant fills from a literal, not `primaryColor` (D232).
    quadrant1Fill: '#ececfe',
  },
  // v12 theme-redux.js: mainBkg darkened by 25 in every slot (75 under darkMode). It sets
  // every slot to mainBkg before it derives the inverses, so they ignore a cScale override.
  palettes: { ...mainBkgScale(25), cScaleLabel: LABEL_SCALE, ...NEO_GIT },
  darkModePalettes: { ...mainBkgScale(75), ...NEO_GIT_DARK_MODE },
};

export default redux;
