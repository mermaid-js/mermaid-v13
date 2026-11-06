/**
 * `forest`: v12 `theme-forest.js`.
 */
import type { ThemeSpec } from '../spec.ts';
import { paletteSlots, series } from './palettes.ts';
import {
  classicGitLabels,
  darkenedScale,
  gitLabelRules,
  gitPalettes,
  gitSources,
  hueSources,
} from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_GITGRAPH, CLASSIC_PADDING, TEXT_SIZES } from './geometry.ts';

const GIT = gitSources(
  'primaryColor',
  'secondaryColor',
  'ifSet(tertiaryColor, lightenHsl(#cde498, 10%))'
);

const theme: ThemeSpec = {
  name: 'forest',
  dark: false,
  family: 'classic',
  base: {
    primaryColor: '#cde498',
    secondaryColor: '#cdffb2',
    tertiaryColor: '#e1efc0',
    background: '#ffffff',
    primaryTextColor: '#321b67',
    lineColor: '#000000',
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
  // v12 theme-forest: khroma lighten(mainBkg, 20), exactly (D117).
  rules: {
    rowEven: 'lightenHsl(mainBkg, 20%)',
    ...gitLabelRules('#32004d', '#abb594'),
  },
  values: {
    altBackground: '#f0f0f0', // v12 (#192)
    // v12 theme-forest.js: the participant border is darken(mainBkg, 20), the fragment tab's
    // a dark green
    softBorder: '#a6cf47',
    frameBorder: '#326932',
    scaleLabelColor: '#000000', // v12: its label ink, black
    linkInkColor: '#333333',
    mutedBkg: '#f4f4f4',
    mutedBorder: '#666666',
    lineTextColor: '#ffffff',
    textColor: '#000000',
    nodeBorder: '#13540c',
    clusterBkg: '#cdffb2',
    clusterBorder: '#6eaa49',
    titleColor: '#333333',
    edgeLabelBackground: '#e8e8e8',
    arrowheadColor: '#008000',
    border2: '#6eaa49',
    noteTextColor: '#000000',
    noteBorderColor: '#6eaa49',
  },
  // v12 theme-forest.js: hue steps darkened by 10, inverses a half turn of hue. Its
  // tertiaryColor is khroma lighten('#cde498', 10), of which the base variable is the hex.
  palettes: {
    ...darkenedScale(
      hueSources(
        false,
        'primaryColor',
        'secondaryColor',
        'ifSet(tertiaryColor, lightenHsl(#cde498, 10%))'
      ),
      10,
      (c) => `adjustHue(${c}, 180)`
    ),
    // v12 sets its label ink before the labels: `scaleLabelColor` (D334).
    cScaleLabel: paletteSlots(() => 'scaleLabelColor'),
    // v12 theme-forest.js: the base colours, primary and secondary −30, then hue turns; then the
    // tints, v12's resolved values.
    seriesColorArray: series(
      'primaryColor secondaryColor tertiaryColor darkenHsl(primaryColor,30%) darkenHsl(secondaryColor,30%) #33b42f #70d990 #d99070 #98cde4 #1a6330 #63301a #1a4d63 ' +
        '#cde498 #cdffb2 #98e4b4 #b2ffe9 #e4aa98 #ffdfb2 #98c3e4 #b2c3ff'
    ),
    // v12: git darkened by 25 (lightened under darkMode), labels 0 and 3 inverted; the label is
    // v12's `labelTextColor`, which forest sets to its label ink (`scaleLabelColor`, D334).
    ...gitPalettes(GIT),
    gitBranchLabel: classicGitLabels('scaleLabelColor'),
  },
  darkModePalettes: {
    ...gitPalettes(GIT, 'lightenHsl'),
    gitBranchLabel: classicGitLabels('scaleLabelColor'),
  },
};

export default theme;
