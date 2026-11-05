/**
 * `redux-color`: the default theme (D151), from v12 `theme-redux-color.js` at 12.2.0. It is
 * `redux` plus the per-subgraph palettes and the Tailwind-300 `cScale`. Every colour the
 * flowchart reads matches `redux`, because v12 12.2.0 pins them the same way in both themes
 * (`primaryBorderColor` from `#28253D`, `clusterBkg`, `clusterBorder`).
 */
import type { ThemeSpec } from '../spec.ts';
import { TAILWIND_300, TAILWIND_400, TAILWIND_50, fillTypes } from './palettes.ts';
import redux from './redux.ts';

const theme: ThemeSpec = {
  ...redux,
  name: 'redux-color',
  // v12 draws ER edge labels on `erEdgeLabelBackground` in the colour themes only.
  values: {
    ...redux.values,
    erEdgeLabelBackground: '#ffffff',
    // v12 `fillType<i> || bkgColorArray[i]` for the journey section fills (`fillTypes`)
    ...fillTypes(TAILWIND_50.slice(0, 8).join(' ')),
  },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: TAILWIND_50,
    cScale: TAILWIND_300,
  },
};

export default theme;
