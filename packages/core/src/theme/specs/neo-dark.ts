/**
 * `neo-dark`: v12's neo-dark theme (`theme-neo-dark.js` at 12.2.0), in core behind `import()`
 * (D180), cleaned up into a proper dark theme (D183). v12 never set `darkMode` on it, so it
 * derived its borders, the note border and the edge label background with the light rules,
 * and it drew with stroke width 1. Here it derives those with the dark rules and takes
 * `neo`'s tokens (stroke width 2, corner radius 3, the redux family geometry, D181). Every
 * other value is v12 12.2.0's resolved `getThemeVariables()`, pinned where the shared dark
 * rules (D71) would move it, except one AA fix (R-THEME-9).
 * `packages/conformance/src/neo-dark-theme.spec.ts` checks every one against v12.
 */
import type { ThemeSpec } from '../spec.ts';
import { DARK_HUE_SOURCES, LABEL_SCALE, darkenedScale } from './palettes.ts';
import {
  NEO_ARROWHEADS,
  NEO_CLASS_MARKERS,
  NEO_SEQUENCE,
  REDUX_PADDING,
  TEXT_SIZES,
} from './geometry.ts';
import { REDUX_RULES } from './redux-rules.ts';

const neoDark: ThemeSpec = {
  name: 'neo-dark',
  dark: true,
  base: {
    primaryColor: '#1f2020',
    // v12 lighten(primaryColor, 16) and adjust(primaryColor, { h: -160 }).
    secondaryColor: '#474949',
    tertiaryColor: '#201f1f',
    background: '#333333',
    primaryTextColor: '#e0dfdf',
    lineColor: '#cccccc',
    fontFamily: 'arial, sans-serif',
    fontSize: '14px',
  },
  tokens: {
    // D183: v12 neo-dark had 1; 2 like `neo`.
    strokeWidth: 2,
    clusterStrokeWidth: 1,
    radius: 3,
    fontWeight: 'normal',
    spacing1: 4,
    spacing2: 8,
    spacing3: 16,
    ...NEO_ARROWHEADS,
    ...NEO_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...REDUX_PADDING,
    ...NEO_SEQUENCE,
    // v12 theme-neo-dark.js: outlines take the blue-to-red gradient (D182).
    useGradient: true,
  },
  // As `neo`: v12 neo-dark sets `classText` from `textColor`, has no ER row fill of its own,
  // and the neo-look zero circle takes the node fill.
  rules: REDUX_RULES,
  values: {
    // v12 `drop-shadow( 1px 2px 2px rgba(185,185,185,0.2))`, normalised for `checkFilter`.
    dropShadow: 'drop-shadow(1px 2px 2px rgb(185 185 185 / 0.2))',
    mainBkg: '#2a2020',
    textColor: '#cccccc',
    // v12 invert(background), whatever the mode.
    primaryBorderColor: '#cccccc',
    // v12 has #b8b6b6, which is 4.49:1 on secondaryColor; a shade lighter meets AA (D183).
    secondaryTextColor: '#b9b7b7',
    tertiaryTextColor: '#dfe0e0',
    nodeTextColor: '#e0dfdf',
    titleColor: '#dfe0e0',
    border2: '#ffffff40',
    noteBkgColor: '#fff5ad',
    // khroma darken(secondaryColor, 10), whatever the mode.
    activationBorderColor: '#2e3030',
    errorBkgColor: '#201f1f',
    errorTextColor: '#dfe0e0',
    // v12 kept the light theme's #f0f0f0, on which the #cccccc lines of a nested composite all
    // but vanished (D189).
    altBackground: '#404040',
    // v12 theme-neo-dark.js (D182).
    gradientStart: '#0042eb',
    gradientStop: '#eb0042',
  },
  // v12 theme-neo-dark.js: hue steps darkened by 25 (75 under darkMode).
  palettes: { ...darkenedScale(DARK_HUE_SOURCES, 25), cScaleLabel: LABEL_SCALE },
  darkModePalettes: darkenedScale(DARK_HUE_SOURCES, 75),
};

export default neoDark;
