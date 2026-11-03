/**
 * `redux-color`: the default theme (D151), from v12 `theme-redux-color.js` at 12.2.0. It is
 * `redux` plus the per-subgraph palettes and the Tailwind-300 `cScale`. Every colour the
 * flowchart reads matches `redux`, because v12 12.2.0 pins them the same way in both themes
 * (`primaryBorderColor` from `#28253D`, `clusterBkg`, `clusterBorder`).
 */
import type { ThemeSpec } from '../spec.ts';
import { TAILWIND_300, TAILWIND_400, TAILWIND_50 } from './palettes.ts';
import { NEO_ARROWHEADS, REDUX_PADDING } from './geometry.ts';

const theme: ThemeSpec = {
  name: 'redux-color',
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
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: TAILWIND_50,
    cScale: TAILWIND_300,
  },
};

export default theme;
