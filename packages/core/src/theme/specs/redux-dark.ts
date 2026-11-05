/**
 * `redux-dark`: v12 `theme-redux-dark.js` at 12.2.0. v12 never sets `darkMode` on it, so where
 * it derives a colour it uses the light-mode rule (`edgeLabelBackground` is `secondaryColor`);
 * those values are pinned here rather than left to the shared dark rules.
 */
import type { ThemeSpec } from '../spec.ts';
import { fillTypes } from './palettes.ts';
import { REDUX_RULES } from './redux-rules.ts';
import { REDUX_DARK_BASE, REDUX_DARK_TOKENS, REDUX_DARK_VALUES } from './redux-dark-values.ts';

const theme: ThemeSpec = {
  name: 'redux-dark',
  dark: true,
  base: REDUX_DARK_BASE,
  tokens: REDUX_DARK_TOKENS,
  rules: REDUX_RULES,
  values: {
    ...REDUX_DARK_VALUES,
    ...fillTypes('#1f2020 #474949 #1f1f20 #474749 #1f201f #474947 #201f20 #494749'),
  },
};

export default theme;
