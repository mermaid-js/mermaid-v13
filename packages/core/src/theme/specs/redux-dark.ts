/**
 * `redux-dark`: v12 `theme-redux-dark.js` at 12.2.0. v12 never sets `darkMode` on it, so where
 * it derives a colour it uses the light-mode rule (`edgeLabelBackground` is `secondaryColor`);
 * those values are pinned here rather than left to the shared dark rules.
 */
import type { ThemeSpec } from '../spec.ts';
import { fillTypes, LABEL_SCALE, REDUX_RULES } from './palettes.ts';
import { DARK_HUE_SOURCES, darkenedScale } from './scales.ts';
import {
  PIE_REDUX_DARK,
  REDUX_DARK_GIT,
  REDUX_DARK_GIT_DARK_MODE,
  REDUX_DARK_BASE,
  REDUX_DARK_TOKENS,
  REDUX_DARK_VALUES,
} from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark',
  dark: true,
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  rules: { ...REDUX_RULES, ...PIE_REDUX_DARK },
  values: {
    ...REDUX_DARK_VALUES,
    // journey section fills, v12's resolved values (`fillTypes`)
    ...fillTypes('#1f2020 #474949 #1f1f20 #474749 #1f201f #474947 #201f20 #494749'),
  },
  // v12 theme-redux-dark.js: hue steps darkened by 25 (75 under darkMode); git as base derives it.
  palettes: {
    ...darkenedScale(DARK_HUE_SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    ...REDUX_DARK_GIT,
  },
  darkModePalettes: { ...darkenedScale(DARK_HUE_SOURCES, 75), ...REDUX_DARK_GIT_DARK_MODE },
};

export default theme;
