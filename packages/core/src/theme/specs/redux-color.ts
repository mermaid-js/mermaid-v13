/**
 * `redux-color`: the default theme (D151), from v12 `theme-redux-color.js` at 12.2.0. It is
 * `redux` plus the per-subgraph palettes and the Tailwind-300 `cScale`. Every colour the
 * flowchart reads matches `redux`, because v12 12.2.0 pins them the same way in both themes
 * (`primaryBorderColor` from `#28253D`, `clusterBkg`, `clusterBorder`).
 */
import type { ThemeSpec } from '../spec.ts';
import {
  INVERTED_SCALE,
  LABEL_SCALE,
  pieSlots,
  TAILWIND_300,
  TAILWIND_400,
  TAILWIND_50,
} from './palettes.ts';
import redux from './redux.ts';

const theme: ThemeSpec = {
  ...redux,
  name: 'redux-color',
  // v12 draws ER edge labels on `erEdgeLabelBackground` in the colour themes only.
  // v12 `pie<i+1> ||= cScale<i>`: the Tailwind-300 set.
  rules: { ...redux.rules, ...pieSlots(TAILWIND_300) },
  values: { ...redux.values, erEdgeLabelBackground: '#ffffff' },
  palettes: {
    borderColorArray: TAILWIND_400,
    bkgColorArray: TAILWIND_50,
    cScale: TAILWIND_300,
    cScaleInv: INVERTED_SCALE,
    cScaleLabel: LABEL_SCALE,
  },
  // v12 theme-redux-color.js does not darken its fixed cScale under darkMode.
  darkModePalettes: {},
};

export default theme;
