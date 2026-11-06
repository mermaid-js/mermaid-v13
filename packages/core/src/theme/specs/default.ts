/**
 * `default`: v12's classic lavender theme (`theme-default.js`).
 */
import type { ThemeSpec } from '../spec.ts';
import { paletteSlots, series } from './palettes.ts';
import {
  CLASSIC_ARROWHEADS,
  CLASSIC_CLASS_MARKERS,
  CLASSIC_PADDING,
  CLASSIC_SEQUENCE,
  TEXT_SIZES,
} from './geometry.ts';

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
    ...CLASSIC_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...CLASSIC_PADDING,
    ...CLASSIC_SEQUENCE,
    useGradient: false,
  },
  values: {
    altBackground: '#f0f0f0', // v12 (#192)
    // sequence (v12 theme-default.js)
    actorTextColor: '#000000',
    // v12 `scaleLabelColor`: `labelTextColor`, which theme-default sets to `actorTextColor`.
    scaleLabelColor: '#000000',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
    textColor: '#333333',
    nodeBorder: '#9370db',
    clusterBkg: '#ffffde',
    clusterBorder: '#aaaa33',
    titleColor: '#333333',
    edgeLabelBackground: '#e8e8e8cc',
    border2: '#aaaa33',
    noteTextColor: '#000000',
    noteBorderColor: '#aaaa33',
  },
  // v12 theme-default derives the ER rows from primaryColor with khroma (D117).
  rules: {
    rowOdd: 'lightenHsl(primaryColor, 75%)',
    rowEven: 'lightenHsl(primaryColor, 1%)',
  },
  // v12 theme-default.js fills cScale and cScaleInv in its constructor, darkens cScale again
  // when it calculates, and never recomputes them: fixed lists that ignore the base colours.
  palettes: {
    // v12 theme-default.js: the base colours, tertiary −40, secondary −30, tertiary −20, then hue
    // turns. Slots 2 and 5 are v12's values: v12 darkens its unrounded HSL tertiary colour, which
    // lands a few steps off the hex one. Then the tints (±64° and 128° turns of the primary and
    // secondary colours) and v12's black title ink.
    seriesColorArray: series(
      'primaryColor secondaryColor #b5ff20 darkenHsl(primaryColor,10%) darkenHsl(secondaryColor,30%) #d7ff86 #ff86ff #20ffff #ff2020 #ff20ff #20ff8f #ff5353 ' +
        '#ececff #ffffde #ffecfe #deffe0 #ecfffe #ffdee0 #ffefec #defbff black textColor'
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
    // v12 inverts its label ink (`actorTextColor`, black) in slots 0 and 3 and ignores
    // `scaleLabelColor`: the resolved colours, so no sequence variable is read (D334).
    cScaleLabel: paletteSlots((i) => (i === 0 || i === 3 ? '#ffffff' : '#000000')),
  },
};

export default theme;
