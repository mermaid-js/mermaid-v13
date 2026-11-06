/**
 * `redux-dark`: v12 `theme-redux-dark.js` at 12.2.0. v12 never sets `darkMode` on it, so where
 * it derives a colour it uses the light-mode rule (`edgeLabelBackground` is `secondaryColor`);
 * those values are pinned here rather than left to the shared dark rules.
 */
import type { ThemeSpec } from '../spec.ts';
import { LABEL_SCALE, REDUX_RULES } from './palettes.ts';
import { DARK_HUE_SOURCES, darkenedScale, gitLabelRules } from './scales.ts';
import {
  REDUX_DARK_GIT,
  REDUX_DARK_GIT_DARK_MODE,
  REDUX_DARK_BASE,
  REDUX_DARK_SERIES,
  REDUX_DARK_TOKENS,
  REDUX_DARK_VALUES,
} from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark',
  dark: true,
  family: 'redux',
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  rules: {
    ...REDUX_RULES,
    ...gitLabelRules('invert(lightenHsl(#1f2020, 16%))', '#cccccc'),
  },
  values: REDUX_DARK_VALUES,
  // v12 theme-redux-dark.js: hue steps darkened by 25 (75 under darkMode); git as base derives it.
  palettes: {
    ...darkenedScale(DARK_HUE_SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    seriesColorArray: REDUX_DARK_SERIES,
    ...REDUX_DARK_GIT,
  },
  darkModePalettes: { ...darkenedScale(DARK_HUE_SOURCES, 75), ...REDUX_DARK_GIT_DARK_MODE },
};

export default theme;
