/**
 * `redux`: the monochrome redux theme, from v12 `theme-redux.js`. Its tokens (stroke width 2, radius 12)
 * are what makes every diagram type in redux look like one family (R-THEME-11).
 */
import type { ThemeSpec } from '../spec.ts';
import { NEO_ARROWHEADS, REDUX_PADDING } from './geometry.ts';

const redux: ThemeSpec = {
  name: 'redux',
  dark: false,
  base: {
    primaryColor: '#cccccc',
    secondaryColor: '#cccccc',
    tertiaryColor: '#ffffff',
    background: '#ffffff',
    primaryTextColor: '#28253d',
    lineColor: '#000000',
    fontFamily: '"Recursive Variable", arial, sans-serif',
    fontSize: '14px',
  },
  tokens: {
    strokeWidth: 2,
    clusterStrokeWidth: 1,
    radius: 12,
    fontWeight: 600,
    spacing1: 4,
    spacing2: 8,
    spacing3: 16,
    ...NEO_ARROWHEADS,
    ...REDUX_PADDING,
  },
  values: {
    // v12's hard drop shadow (insertLookDefs: dx/dy 4, no blur, 6% black) as a CSS filter.
    dropShadow: 'drop-shadow(4px 4px 0 rgb(0 0 0 / 0.06))',
    primaryBorderColor: '#28253d',
    mainBkg: '#ffffff',
    clusterBkg: '#f9f9fb',
    clusterBorder: '#bdbccc',
    noteBkgColor: '#fff5ad',
    noteTextColor: '#28253d',
    noteBorderColor: '#facc15',
    errorBkgColor: '#ffffff',
    errorTextColor: '#000000',
  },
};

export default redux;
