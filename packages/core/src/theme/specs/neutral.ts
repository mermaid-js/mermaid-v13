/**
 * `neutral`: v12 `theme-neutral.js`, greys for print.
 */
import type { ThemeSpec } from '../spec.ts';
import { INVERTED_SCALE, paletteSlots, series, SERIES_TINTS } from './palettes.ts';
import { darkModeLabels, fixedGit, gitLabelRules } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING } from './geometry.ts';

const theme: ThemeSpec = {
  name: 'neutral',
  dark: false,
  family: 'classic',
  base: {
    primaryColor: '#eeeeee',
    secondaryColor: '#fcfcfc',
    tertiaryColor: '#eeeeee',
    background: '#ffffff',
    primaryTextColor: '#111111',
    lineColor: '#666666',
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
  rules: gitLabelRules('#030303', '#d4d4d4'),
  values: {
    // v12 theme-neutral.js sets these in its constructor and never recomputes them, so no base
    // colour moves them (#773, #798): the node fill, the borders, the inverted text inks, and
    // the error colours, which darkMode leaves alone.
    mainBkg: '#eeeeee',
    // v12's constructor line colour (`guideLineColor` in vocabulary.ts).
    guideLineColor: '#666666',
    border1: '#999999',
    primaryBorderColor: '#d4d4d4',
    secondaryBorderColor: '#e3e3e3',
    tertiaryBorderColor: '#d4d4d4',
    secondaryTextColor: '#030303',
    tertiaryTextColor: '#111111',
    errorBkgColor: '#552222',
    errorTextColor: '#552222',
    // v12 titles and legends: `taskTextDarkColor`.
    headingTextColor: '#333333',
    nestedBkg: '#f4f4f4', // v12 `altBackground` (#192)
    // v12 theme-neutral.js: the participant border is lighten(border1, 23)
    softBorder: '#d4d4d4',
    scaleLabelColor: '#333333', // v12: `labelTextColor` (D334)
    linkInkColor: '#333333',
    mutedBkg: '#f4f4f4',
    mutedBorder: '#666666',
    lineTextColor: '#ffffff',
    textColor: '#000000',
    nodeBorder: '#999999',
    clusterBkg: '#fcfcfc',
    clusterBorder: '#707070',
    titleColor: '#333333',
    border2: '#707070',
    noteBkgColor: '#666666',
    noteTextColor: '#ffffff',
    noteBorderColor: '#999999',
    // v12 theme-neutral sets the ER rows in its constructor, so they never follow an
    // override: khroma lighten(#eee, 75) is white (D117).
    rowBkg: '#ffffff',
    rowAltBkg: '#f4f4f4',
  },
  // v12 theme-neutral.js: fixed greys; labels 0 and 2 take cScale1.
  palettes: {
    plotColorArray: series(
      '#EEE #6BB8E4 #8ACB88 #C7ACD6 #E8DCC2 #FFB2A8 #FFF380 #7E8D91 #FFD8B1 #FAF3E0'
    ),
    cScale: [
      '#555555',
      '#f4f4f4',
      '#555555',
      '#bbbbbb',
      '#777777',
      '#999999',
      '#dddddd',
      '#ffffff',
      '#dddddd',
      '#bbbbbb',
      '#999999',
      '#777777',
    ],
    cScaleInv: INVERTED_SCALE,
    // v12 theme-neutral.js: series colour `i` is `cScale<i>`, the twelfth `cScale0`; then the
    // tints, which v12 recomputes from the base colours (`SERIES_TINTS`, D656).
    seriesColorArray: series(
      '#f4f4f4 #555555 #bbbbbb #777777 #999999 #dddddd #ffffff #dddddd #bbbbbb #999999 #777777 #555555 ' +
        SERIES_TINTS
    ),
    // v12 sets labelTextColor to its own text colour (#333) before the labels.
    cScaleLabel: paletteSlots((i) => (i === 0 || i === 2 ? 'cScale1' : 'scaleLabelColor')),
    // v12 theme-neutral.js: pie1 darkened by 25, then pie2–pie8; labels 1 and 3 white, the
    // others its own text colour, as for cScaleLabel. v12's `pie<i>` is `cScale<i>` here; the
    // shared palette reads `cScale<i>`, never pie's (D334).
    ...fixedGit(['darkenHsl(cScale1, 25%)', ...[2, 3, 4, 5, 6, 7, 8].map((n) => `cScale${n}`)]),
    gitBranchLabel: paletteSlots((i) => (i === 1 || i === 3 ? 'white' : '#333333'), 8),
  },
  darkModePalettes: { cScaleLabel: darkModeLabels({ 0: 'cScale1', 2: 'cScale1' }) },
};

export default theme;
