/**
 * `neutral`: v12 `theme-neutral.js`, greys for print.
 */
import type { ThemeRuleTable, ThemeSpec } from '../spec.ts';
import { pieSlots } from './palettes.ts';
import {
  CLASSIC_ARROWHEADS,
  CLASSIC_CLASS_MARKERS,
  CLASSIC_PADDING,
  CLASSIC_SEQUENCE,
  TEXT_SIZES,
} from './geometry.ts';

/** v12 `theme-neutral.js`: `pie<i>` is `cScale<i>`, `pie12` is `cScale0`. */
const PIE_NEUTRAL: ThemeRuleTable = {
  ...pieSlots([
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
    '#555555',
  ]),
  // v12 titles and legends: `taskTextDarkColor` (or `mainContrastColor`).
  pieTitleTextColor: '#333333',
  pieLegendTextColor: '#333333',
};

const theme: ThemeSpec = {
  name: 'neutral',
  dark: false,
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
    ...CLASSIC_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...CLASSIC_PADDING,
    ...CLASSIC_SEQUENCE,
    useGradient: false,
  },
  rules: PIE_NEUTRAL,
  values: {
    altBackground: '#f4f4f4', // v12 (#192)
    // sequence (v12 theme-neutral.js: actorBorder is lighten(border1, 23))
    actorBorder: '#d4d4d4',
    actorTextColor: '#333333',
    signalColor: '#333333',
    signalTextColor: '#333333',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
    textColor: '#000000',
    nodeBorder: '#999999',
    clusterBkg: '#fcfcfc',
    clusterBorder: '#707070',
    titleColor: '#333333',
    edgeLabelBackground: '#ffffff',
    arrowheadColor: '#333333',
    border2: '#707070',
    noteBkgColor: '#666666',
    noteTextColor: '#ffffff',
    noteBorderColor: '#999999',
    // v12 theme-neutral sets the ER rows in its constructor, so they never follow an
    // override: khroma lighten(#eee, 75) is white (D117).
    rowOdd: '#ffffff',
    rowEven: '#f4f4f4',
  },
};

export default theme;
