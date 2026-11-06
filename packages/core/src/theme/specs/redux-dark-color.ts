/**
 * `redux-dark-color`: v12 `theme-redux-dark-color.js` at 12.2.0. `redux-dark` plus the
 * Tailwind-400 border palette and the Tailwind-300 `cScale`. The fill palette is empty, so a
 * subgraph is coloured on its border only and keeps its contrast in dark mode.
 */
import type { ThemeSpec } from '../spec.ts';
import {
  fillTypes,
  INVERTED_SCALE,
  paletteSlots,
  pieSlots,
  REDUX_RULES,
  TAILWIND_300,
  TAILWIND_400,
} from './palettes.ts';
import { gitLabelRules } from './scales.ts';
import {
  REDUX_DARK_BASE,
  REDUX_DARK_GIT,
  REDUX_DARK_GIT_DARK_MODE,
  REDUX_DARK_TOKENS,
  REDUX_DARK_VALUES,
} from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark-color',
  dark: true,
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  // v12 draws pie section text in the light ink here (`pieSectionTextColor`).
  rules: {
    ...REDUX_RULES,
    ...pieSlots(TAILWIND_300),
    pieSectionTextColor: '#28253d',
    ...gitLabelRules('invert(lightenHsl(#1f2020, 16%))', '#cccccc'),
  },
  values: {
    ...REDUX_DARK_VALUES,
    erEdgeLabelBackground: '#16141f',
    // v12's fixed 900 shades for the journey section fills (`fillTypes`)
    ...fillTypes('#701a75 #134e4a #7c2d12 #581c87 #14532d #4c1d95 #7f1d1d #713f12'),
  },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: [],
    cScale: TAILWIND_300,
    cScaleInv: INVERTED_SCALE,
    // v12 theme-redux-dark-color.js: each label is its slot darkened by 75.
    cScaleLabel: paletteSlots((i) => `darkenHsl(cScale${i}, 75%)`),
    ...REDUX_DARK_GIT,
  },
  darkModePalettes: REDUX_DARK_GIT_DARK_MODE,
};

export default theme;
