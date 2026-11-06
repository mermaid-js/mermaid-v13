/**
 * `redux-dark-color`: v12 `theme-redux-dark-color.js` at 12.2.0. `redux-dark` plus the
 * Tailwind-400 border palette and the Tailwind-300 `cScale`. The fill palette is empty, so a
 * subgraph is coloured on its border only and keeps its contrast in dark mode.
 */
import type { ThemeSpec } from '../spec.ts';
import {
  INVERTED_SCALE,
  paletteSlots,
  REDUX_RULES,
  series,
  TAILWIND_300,
  TAILWIND_400,
} from './palettes.ts';
import { REDUX_DARK_BASE, REDUX_DARK_TOKENS, REDUX_DARK_VALUES } from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark-color',
  dark: true,
  family: 'redux',
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  rules: REDUX_RULES,
  values: { ...REDUX_DARK_VALUES, erEdgeLabelBackground: '#16141f' },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: [],
    cScale: TAILWIND_300,
    cScaleInv: INVERTED_SCALE,
    // v12 theme-redux-dark-color.js: each label is its slot darkened by 75.
    cScaleLabel: paletteSlots((i) => `darkenHsl(cScale${i}, 75%)`),
    // The Tailwind-300 set, v12's fixed 900 shades as tints, and v12's light ink for labels on the
    // series colours.
    seriesColorArray: [
      ...TAILWIND_300,
      ...series(
        '#701a75 #134e4a #7c2d12 #581c87 #14532d #4c1d95 #7f1d1d #713f12 textColor #28253d'
      ),
    ],
  },
};

export default theme;
