/**
 * The values `redux-dark` and `redux-dark-color` share, from v12 `theme-redux-dark.js` and
 * `theme-redux-dark-color.js` at 12.2.0 (identical for every variable v13 reads).
 */
import type { ThemeSpec } from '../spec.ts';
import { series } from './palettes.ts';
import { NEO_ARROWHEADS, REDUX_PADDING } from './geometry.ts';

export const REDUX_DARK_BASE: ThemeSpec['base'] = {
  primaryColor: '#1f2020',
  secondaryColor: '#474949',
  tertiaryColor: '#201f1f',
  background: '#333333',
  primaryTextColor: '#e0dfdf',
  lineColor: '#cccccc',
  fontFamily: '"Recursive Variable", arial, sans-serif',
  fontSize: '14px',
};

export const REDUX_DARK_TOKENS: ThemeSpec['tokens'] = {
  strokeWidth: 2,
  clusterStrokeWidth: 1,
  radius: 12,
  fontWeight: 600,
  spacing1: 4,
  spacing2: 8,
  spacing3: 16,
  ...NEO_ARROWHEADS,
  ...REDUX_PADDING,
  useGradient: false,
};

export const REDUX_DARK_VALUES: NonNullable<ThemeSpec['values']> = {
  // v12 theme-redux-dark.js: the fragment tab's border, as the cluster border
  frameBorder: '#bdbccc',
  // v12's drop shadow in white for a theme name with 'dark' (insertLookDefs), as a CSS filter.
  dropShadow: 'drop-shadow(4px 4px 0 rgb(255 255 255 / 0.06))',
  primaryBorderColor: '#cccccc',
  secondaryBorderColor: '#2f2f2f',
  tertiaryBorderColor: '#060606',
  // v12 has #b8b6b6, which is 4.49:1 on secondaryColor; a shade lighter meets AA.
  secondaryTextColor: '#b9b7b7',
  tertiaryTextColor: '#dfe0e0',
  textColor: '#cccccc',
  mainBkg: '#111113',
  nodeBorder: '#ffffff',
  nodeTextColor: '#e0dfdf',
  clusterBkg: '#1e1a2e',
  clusterBorder: '#bdbccc',
  titleColor: '#dfe0e0',
  edgeLabelBackground: '#474949',
  border1: '#cccccc',
  border2: '#ffffff40',
  noteBkgColor: '#fef9c3',
  noteTextColor: '#28253d',
  noteBorderColor: '#facc15',
  errorBkgColor: '#201f1f',
  errorTextColor: '#dfe0e0',
  // v12 theme-redux*.js; off until a theme or the author turns it on (D182).
  gradientStart: '#0042eb',
  gradientStop: '#eb0042',
};

/**
 * The series palette (D332) of v12 `theme-redux-dark.js` and `theme-neo-dark.js`: base's formulas.
 * Entry 4 is v12's value, since v12 darkens the unrounded HSL secondary colour, which lands one
 * step off the hex one. Then the tints, v12's resolved values.
 */
export const REDUX_DARK_SERIES = series(
  'primaryColor secondaryColor tertiaryColor darkenHsl(primaryColor,10%) #2e3030 darkenHsl(tertiaryColor,10%) #060606 #060606 #201f20 #000000 #000000 #060606 ' +
    '#1f2020 #474949 #1f1f20 #474749 #1f201f #474947 #201f20 #494749'
);
