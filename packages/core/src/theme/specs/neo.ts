/**
 * `neo`: v12's neo theme (`theme-neo.js` at 12.2.0), in core behind `import()` (D180). It
 * draws the v12 `look: neo` geometry of the redux family, with neo's own tokens: corner radius
 * 3, the blurred neo shadow, `arial, sans-serif` at 14px and no per-item palette (D181). The
 * literal values are v12 12.2.0's resolved `getThemeVariables()`, so the shared light rules,
 * which only approximate v12's khroma maths (D71), do not move them;
 * `packages/conformance/src/neo-theme.spec.ts` checks every one against v12.
 */
import type { ThemeSpec } from '../spec.ts';
import { BASE_PLOT, BASE_SECONDARY, LABEL_SCALE } from './palettes.ts';
import { darkenedScale, gitLabelRules, hueSources } from './scales.ts';
import { NEO_ARROWHEADS, REDUX_PADDING } from './geometry.ts';
import { NEO_GIT, NEO_GIT_DARK_MODE, REDUX_SERIES } from './redux.ts';

const SOURCES = hueSources(true, '#ececfe', '#e9e9f1', 'lightenHsl(adjustHue(#ececfe, 180), 5%)');

const neo: ThemeSpec = {
  name: 'neo',
  dark: false,
  family: 'neo',
  base: {
    primaryColor: '#cccccc',
    // v12 adjust(primaryColor, { h: -120 }), a no-op on a grey.
    secondaryColor: '#cccccc',
    tertiaryColor: '#ffffff',
    background: '#ffffff',
    primaryTextColor: '#333333',
    lineColor: '#000000',
    fontFamily: 'arial, sans-serif',
    fontSize: '14px',
  },
  tokens: {
    strokeWidth: 2,
    clusterStrokeWidth: 1,
    // v12 reads `themeVariables.radius` for the rounded rectangle (`roundedRect.ts`) and the
    // neo composite state (`state/styles.js`), so the theme's 3 is the corner (D181).
    radius: 3,
    fontWeight: 'normal',
    spacing1: 4,
    spacing2: 8,
    spacing3: 16,
    ...NEO_ARROWHEADS,
    ...REDUX_PADDING,
    // v12 theme-neo.js: outlines take the blue-to-red gradient (D182).
    useGradient: true,
  },
  rules: {
    ...gitLabelRules(`invert(${BASE_SECONDARY})`, '#b3b3b3', BASE_SECONDARY),
  },
  values: {
    // v12 `drop-shadow( 0px 1px 2px rgba(0, 0, 0, 0.25));`, normalised for `checkFilter`.
    dropShadow: 'drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))',
    mainBkg: '#ffffff',
    nodeBorder: '#000000',
    // khroma mkBorder: darken 10 on HSL lightness.
    primaryBorderColor: '#b3b3b3',
    secondaryBorderColor: '#b3b3b3',
    tertiaryBorderColor: '#e6e6e6',
    tertiaryTextColor: '#000000',
    titleColor: '#000000',
    noteBorderColor: '#e4db95',
    // v12 neo leaves the participant border at primaryBorderColor, not nodeBorder.
    softBorder: '#b3b3b3',
    errorBkgColor: '#ffffff',
    errorTextColor: '#000000',
    // v12 theme-neo.js (D182).
    gradientStart: '#0042eb',
    gradientStop: '#eb0042',
  },
  // v12 theme-neo.js derives cScale from its own constants (#ECECFE, #E9E9F1), not from
  // primaryColor, darkened by 25 (75 under darkMode).
  palettes: {
    plotColorArray: BASE_PLOT,
    ...darkenedScale(SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    seriesColorArray: REDUX_SERIES,
    ...NEO_GIT,
  },
  darkModePalettes: { ...darkenedScale(SOURCES, 75), ...NEO_GIT_DARK_MODE },
};

export default neo;
