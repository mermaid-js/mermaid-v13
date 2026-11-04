/**
 * The values `redux-dark` and `redux-dark-color` share, from v12 `theme-redux-dark.js` and
 * `theme-redux-dark-color.js` at 12.2.0 (identical for every variable v13 reads).
 */
import type { ThemeSpec } from '../spec.ts';
import { NEO_ARROWHEADS, NEO_SEQUENCE, REDUX_PADDING } from './geometry.ts';

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
  ...NEO_SEQUENCE,
};

export const REDUX_DARK_VALUES: NonNullable<ThemeSpec['values']> = {
  // sequence (v12 theme-redux-dark.js pins these two)
  signalColor: '#ffffff',
  labelBoxBorderColor: '#bdbccc',
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
  // v12 pins the composite-state backgrounds (#192, D126); not clusterBkg (#1e1a2e) or
  // background (#333333).
  compositeBackground: '#16141f',
  compositeTitleBackground: '#16141f',
  altBackground: '#16141f',
  titleColor: '#dfe0e0',
  edgeLabelBackground: '#474949',
  border1: '#cccccc',
  border2: '#ffffff40',
  noteBkgColor: '#fef9c3',
  noteTextColor: '#28253d',
  noteBorderColor: '#facc15',
  errorBkgColor: '#201f1f',
  errorTextColor: '#dfe0e0',
};
