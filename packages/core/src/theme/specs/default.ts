/**
 * `default`: v12's classic lavender theme (`theme-default.js`).
 */
import type { ThemeSpec } from '../spec.ts';
import { paletteSlots, series, SERIES_TINTS } from './palettes.ts';
import { gitSources } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING } from './geometry.ts';

/**
 * v12 `theme-default.js` derives its git palettes in the constructor, from its own colours, and
 * steps them again when it calculates without recomputing them (D267): fixed lists that ignore
 * the base colours, `labelTextColor` and the author's `git<n>` (drawn as given). These are the
 * constructor's values, darkened by 25.
 */
const DEFAULT_GIT = gitSources('#ececff', '#ffffde', 'adjustHue(#ececff, -160)').map(
  (c) => `darkenHsl(${c}, 25%)`
);

const theme: ThemeSpec = {
  name: 'default',
  dark: false,
  family: 'classic',
  base: {
    primaryColor: '#ececff',
    secondaryColor: '#ffffde',
    tertiaryColor: '#f9ffec',
    background: '#ffffff',
    primaryTextColor: '#131300',
    lineColor: '#333333',
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
    // v12 theme-default.js sets these in its constructor and never recomputes them, so no base
    // colour moves them (#773, #798): the node fill, the borders (khroma mkBorder of its own
    // colours), the inverted text inks, and the note and error colours, which darkMode leaves
    // alone. Not the arrowhead: v12's `.marker` draws it in lineColor (D575).
    mainBkg: '#ececff',
    // v12 theme-default.js keeps its constructor tertiary and line colours where gantt draws its
    // section band, the active outline and the `vert` marker, so no override moves them (D656).
    bandBkg: '#f9ffec',
    guideLineColor: '#333333',
    border1: '#9370db',
    primaryBorderColor: '#c7c7f1',
    secondaryBorderColor: '#eeeebc',
    tertiaryBorderColor: '#e3f1c7',
    secondaryTextColor: '#000021',
    tertiaryTextColor: '#060013',
    noteBkgColor: '#fff5ad',
    errorBkgColor: '#552222',
    errorTextColor: '#552222',
    // v12 titles and legends: `taskTextDarkColor`.
    headingTextColor: 'black',
    nestedBkg: '#f0f0f0', // v12 `altBackground` (#192)
    // v12 theme-default.js: the label ink (black), the grey muted surface and border, white
    // text on lines.
    scaleLabelColor: '#000000',
    mutedBkg: '#f4f4f4',
    mutedBorder: '#666666',
    lineTextColor: '#ffffff',
    textColor: '#333333',
    nodeBorder: '#9370db',
    clusterBkg: '#ffffde',
    clusterBorder: '#aaaa33',
    titleColor: '#333333',
    border2: '#aaaa33',
    noteTextColor: '#000000',
    noteBorderColor: '#aaaa33',
    // v12 theme-default.js keeps its constructor background, lineColor, primaryTextColor,
    // primaryColor, tertiaryColor and mainBkg where xychart, wardley, cynefin, quadrant,
    // requirement, state, event modelling, sequence and venn read them, so no override of the
    // base colour moves them there (D656).
    canvasBkg: '#ffffff',
    canvasLineColor: '#333333',
    canvasTextColor: '#131300',
    canvasItemBkg: '#ececff',
    canvasItemBkg3: '#f9ffec',
    canvasNodeBkg: '#ececff',
  },
  // v12 theme-default derives the ER rows from primaryColor with khroma (D117).
  rules: {
    rowBkg: 'lightenHsl(primaryColor, 75%)',
    rowAltBkg: 'lightenHsl(primaryColor, 1%)',
    // v12 sets the gitGraph labels in its constructor too, from its own colours, and keeps them:
    // the badge and the callout (D332).
    badgeTextColor: '#000021',
    badgeBkg: '#ffffde',
    calloutTextColor: '#131300',
    calloutBkg: '#ececff',
    calloutBorder: 'ifSet(primaryBorderColor, #c7c7f1)',
  },
  // v12 theme-default.js fills cScale and cScaleInv in its constructor, darkens cScale again
  // when it calculates, and never recomputes them: fixed lists that ignore the base colours.
  palettes: {
    plotColorArray: series(
      '#ECECFF #8493A6 #FFC3A0 #DCDDE1 #B8E994 #D1A36F #C3CDE6 #FFB6C1 #496078 #F8F3E3'
    ),
    // v12 theme-default.js: the base colours, tertiary −40, primary −10, secondary −30, tertiary
    // −20, then hue turns, which v12 keeps under an override of a base colour, so they are its
    // resolved values (D656). Slots 2 and 5 are darkened from the hex tertiary colour, where v12
    // darkened its unrounded HSL one, a few steps off (D333(a): #b9ff20 against v12's #b5ff20).
    // Then the tints, which v12 recomputes (`SERIES_TINTS`).
    seriesColorArray: series(
      '#ececff #ffffde #b9ff20 #b9b9ff #ffff45 #d9ff86 #ff86ff #20ffff #ff2020 #ff20ff #20ff8f #ff5353 ' +
        SERIES_TINTS
    ),
    cScale: [
      '#8686ff',
      '#ffff78',
      '#d7ff86',
      '#c286ff',
      '#ff86ff',
      '#ff86c2',
      '#ff8686',
      '#ffc286',
      '#c2ff86',
      '#86ffc2',
      '#86ffff',
      '#86c2ff',
    ],
    cScaleInv: [
      '#ffffb9',
      '#ababff',
      '#d0b9ff',
      '#dcffb9',
      '#b9ffb9',
      '#b9ffdc',
      '#b9ffff',
      '#b9dcff',
      '#dcb9ff',
      '#ffb9dc',
      '#ffb9b9',
      '#ffdcb9',
    ],
    // v12 inverts its label ink (black) in slots 0 and 3 and ignores
    // `scaleLabelColor`: the resolved colours, so no sequence variable is read (D334).
    cScaleLabel: paletteSlots((i) => (i === 0 || i === 3 ? '#ffffff' : '#000000')),
    git: DEFAULT_GIT.map((c) => `darkenHsl(${c}, 25%)`),
    gitInv: DEFAULT_GIT.map((c, i) => (i ? `invert(${c})` : `darkenHsl(invert(${c}), 25%)`)),
    gitBranchLabel: paletteSlots((i) => (i === 0 || i === 3 ? 'white' : 'black'), 8),
  },
  darkModePalettes: { git: DEFAULT_GIT.map((c) => `lightenHsl(${c}, 25%)`) },
};

export default theme;
