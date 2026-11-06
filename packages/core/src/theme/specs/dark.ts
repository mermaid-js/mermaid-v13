/**
 * `dark`: v12 `theme-dark.js`.
 */
import type { ThemeSpec } from '../spec.ts';
import { INVERTED_SCALE, paletteSlots, series } from './palettes.ts';
import { darkModeLabels } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING } from './geometry.ts';

const theme: ThemeSpec = {
  name: 'dark',
  dark: true,
  family: 'classic',
  base: {
    primaryColor: '#1f2020',
    secondaryColor: '#474949',
    tertiaryColor: '#201f1f',
    background: '#333333',
    primaryTextColor: '#e0dfdf',
    lineColor: '#d3d3d3',
    fontFamily: '"trebuchet ms", verdana, arial, sans-serif',
    fontSize: '16px',
  },
  tokens: {
    strokeWidth: 1,
    clusterStrokeWidth: 1,
    radius: 5,
    fontWeight: 'normal',
    spacing1: 4,
    spacing2: 8,
    spacing3: 16,
    ...CLASSIC_ARROWHEADS,
    ...CLASSIC_PADDING,
    useGradient: false,
  },
  values: {
    altBackground: '#555555', // v12 (#192)
    // sequence (v12 theme-dark.js: mainContrastColor is lightgrey)
    actorTextColor: '#d3d3d3',
    scaleLabelColor: '#d3d3d3', // v12: `labelTextColor` (D334)
    signalColor: '#d3d3d3',
    signalTextColor: '#d3d3d3',
    activationBorderColor: '#cccccc',
    sequenceNumberColor: '#000000',
    textColor: '#cccccc',
    nodeBorder: '#cccccc',
    clusterBkg: '#474949',
    clusterBorder: '#ffffff40',
    titleColor: '#f9fffe',
    // v12 has #585858, which is 4.45:1 under #ccc text; a shade darker meets AA.
    edgeLabelBackground: '#555555',
    border2: '#ffffff40',
    noteBorderColor: '#2f2f2f',
    errorTextColor: '#dddddd',
    // v12 theme-dark sets the ER rows in its constructor, from its own mainBkg #1f2020, so they
    // never follow an override: khroma lighten(#1f2020, 5) and darken(#1f2020, 10) (D117).
    rowOdd: '#2c2d2d',
    rowEven: '#060606',
  },
  // v12 theme-dark.js: fixed colours after slot 0, which is primaryColor.
  palettes: {
    cScale: [
      'primaryColor',
      '#0b0000',
      '#4d1037',
      '#3f5258',
      '#4f2f1b',
      '#6e0a0a',
      '#3b0048',
      '#995a01',
      '#154706',
      '#161722',
      '#00296f',
      '#01629c',
    ],
    cScaleInv: INVERTED_SCALE,
    // v12 theme-dark.js: series colour `i` is `cScale<i>`, so slot 0 is `cScale1`; v12 leaves the
    // twelfth unset and v13 gives it `cScale0`, as `neutral` has (D228). Then the tints and v12's
    // lightgrey title ink (`mainContrastColor`).
    seriesColorArray: series(
      '#0b0000 #4d1037 #3f5258 #4f2f1b #6e0a0a #3b0048 #995a01 #154706 #161722 #00296f #01629c #1f2020 ' +
        '#1f2020 #474949 #1f1f20 #474749 #1f201f #474947 #201f20 #494749 lightgrey textColor'
    ),
    // v12 sets labelTextColor to its mainContrastColor (lightgrey) before the labels.
    cScaleLabel: paletteSlots(() => 'scaleLabelColor'),
  },
  darkModePalettes: { cScaleLabel: darkModeLabels() },
};

export default theme;
