/**
 * `redux-dark-color`: v12 `theme-redux-dark-color.js` at 12.2.0. `redux-dark` plus the
 * Tailwind-400 border palette and the Tailwind-300 `cScale`. The fill palette is empty, so a
 * subgraph is coloured on its border only and keeps its contrast in dark mode.
 */
import type { ThemeSpec } from '../spec.ts';
import { INVERTED_SCALE, paletteSlots, series, TAILWIND_300, TAILWIND_400 } from './palettes.ts';
import { REDUX_DARK_BASE, REDUX_DARK_TOKENS, REDUX_DARK_VALUES } from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark-color',
  dark: true,
  family: 'redux',
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  values: {
    ...REDUX_DARK_VALUES,
    // v12 draws ER edge labels on a plain fill here.
    linkLabelBkg: '#16141f',
    // v12 draws labels on its series colours in the light ink here.
    seriesTextColor: '#28253d',
  },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: [],
    cScale: TAILWIND_300,
    cScaleInv: INVERTED_SCALE,
    // v12 theme-redux-dark-color.js: each label is its slot darkened by 75.
    cScaleLabel: paletteSlots((i) => `darkenHsl(cScale${i}, 75%)`),
    // The Tailwind-300 set, then v12's fixed 900 shades as tints.
    seriesColorArray: [
      ...TAILWIND_300,
      ...series('#701a75 #134e4a #7c2d12 #581c87 #14532d #4c1d95 #7f1d1d #713f12'),
    ],
  },
};

export default theme;
