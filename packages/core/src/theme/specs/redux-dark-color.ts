/**
 * `redux-dark-color`: v12 `theme-redux-dark-color.js` at 12.2.0. `redux-dark` plus the
 * Tailwind-400 border palette and the Tailwind-300 `cScale`. The fill palette is empty, so a
 * subgraph is coloured on its border only and keeps its contrast in dark mode.
 */
import type { ThemeSpec } from '../spec.ts';
import { REDUX_RULES } from './redux-rules.ts';
import { TAILWIND_300, TAILWIND_400 } from './palettes.ts';
import { REDUX_DARK_BASE, REDUX_DARK_TOKENS, REDUX_DARK_VALUES } from './redux-dark-values.ts';
import { fillTypes } from './journey-fills.ts';

const theme: ThemeSpec = {
  name: 'redux-dark-color',
  dark: true,
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  rules: REDUX_RULES,
  values: {
    ...REDUX_DARK_VALUES,
    erEdgeLabelBackground: '#16141f',
    // v12's fixed 900 shades for the journey section fills (journey-fills.ts)
    ...fillTypes([
      '#701a75',
      '#134e4a',
      '#7c2d12',
      '#581c87',
      '#14532d',
      '#4c1d95',
      '#7f1d1d',
      '#713f12',
    ]),
  },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: [],
    cScale: TAILWIND_300,
  },
};

export default theme;
