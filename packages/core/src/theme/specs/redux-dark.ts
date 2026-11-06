/**
 * `redux-dark`: v12 `theme-redux-dark.js` at 12.2.0. v12 never sets `darkMode` on it, so where
 * it derives a colour it uses the light-mode rule (`edgeLabelBackground` is `secondaryColor`);
 * those values are pinned here rather than left to the shared dark rules.
 */
import type { ThemeSpec } from '../spec.ts';
import { LABEL_SCALE } from './palettes.ts';
import { DARK_HUE_SOURCES, darkenedScale } from './scales.ts';
import {
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
  values: REDUX_DARK_VALUES,
  // v12 theme-redux-dark.js: hue steps darkened by 25 (75 under darkMode).
  palettes: {
    ...darkenedScale(DARK_HUE_SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    seriesColorArray: REDUX_DARK_SERIES,
  },
  darkModePalettes: darkenedScale(DARK_HUE_SOURCES, 75),
};

export default theme;
