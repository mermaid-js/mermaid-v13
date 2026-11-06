/**
 * `dark`: v12 `theme-dark.js`.
 */
import type { ThemeSpec } from '../spec.ts';
import { INVERTED_SCALE, paletteSlots, series } from './palettes.ts';
import { classicGitLabels, darkModeLabels, fixedGit, gitLabelRules } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_GITGRAPH, CLASSIC_PADDING, TEXT_SIZES } from './geometry.ts';

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
    ...TEXT_SIZES,
    ...CLASSIC_GITGRAPH,
    useGradient: false,
  },
  rules: {
    ...gitLabelRules('invert(lightenHsl(#1f2020, 16%))', '#cccccc'),
    // gitGraph branch lines, v12's `commitLineColor ?? lineColor`: `theme: 'auto'` pairs
    // `redux-color` (which sets it) with this theme, so its dark side needs a value (#374).
    commitLineColor: 'lineColor',
  },
  values: {
    // v12 titles and legends: `mainContrastColor`.
    headingTextColor: 'lightgrey',
    // gitGraph: the cherry-pick ink of v12's `DARK_THEMES` (#374).
    gitCherryPickInk: '#000000',
    altBackground: '#555555', // v12 (#192)
    // v12 theme-dark.js: mainContrastColor (lightgrey) for labels and links
    scaleLabelColor: '#d3d3d3', // v12: `labelTextColor` (D334)
    linkInkColor: '#d3d3d3',
    mutedBorder: '#cccccc',
    lineTextColor: '#000000',
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
    // twelfth unset and v13 gives it `cScale0`, as `neutral` has (D228). Then the tints.
    seriesColorArray: series(
      '#0b0000 #4d1037 #3f5258 #4f2f1b #6e0a0a #3b0048 #995a01 #154706 #161722 #00296f #01629c #1f2020 ' +
        '#1f2020 #474949 #1f1f20 #474749 #1f201f #474947 #201f20 #494749'
    ),
    // v12 sets labelTextColor to its mainContrastColor (lightgrey) before the labels.
    cScaleLabel: paletteSlots(() => 'scaleLabelColor'),
    // v12 theme-dark.js: lighten(pie<n+1>) by 20 (10 in slots 5 and 6), slot 0 from
    // secondaryColor, whatever darkMode is; it never reads git<n> before inverting. v12's
    // `pie<i>` is `cScale<i>` here; the shared palette reads `cScale<i>`, never pie's (D334).
    ...fixedGit([
      'lightenHsl(ifSet(secondaryColor, lightenHsl(#1f2020, 16%)), 20%)',
      'lightenHsl(cScale2, 20%)',
      'lightenHsl(cScale3, 20%)',
      'lightenHsl(cScale4, 20%)',
      'lightenHsl(cScale5, 20%)',
      'lightenHsl(cScale6, 10%)',
      'lightenHsl(cScale7, 10%)',
      'lightenHsl(cScale8, 20%)',
    ]),
    gitBranchLabel: classicGitLabels('#d3d3d3'),
  },
  darkModePalettes: { cScaleLabel: darkModeLabels() },
};

export default theme;
