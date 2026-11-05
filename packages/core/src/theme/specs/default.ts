/**
 * `default`: v12's classic lavender theme (`theme-default.js`).
 */
import type { ThemeSpec } from '../spec.ts';
import { paletteSlots } from './palettes.ts';
import {
  CLASSIC_ARROWHEADS,
  CLASSIC_CLASS_MARKERS,
  CLASSIC_PADDING,
  CLASSIC_SEQUENCE,
  CLASSIC_TIMELINE,
  TEXT_SIZES,
} from './geometry.ts';

const theme: ThemeSpec = {
  name: 'default',
  dark: false,
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
    ...CLASSIC_TIMELINE,
    useGradient: false,
  },
  values: {
    altBackground: '#f0f0f0', // v12 (#192)
    // sequence (v12 theme-default.js)
    actorTextColor: '#000000',
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
  rules: { rowOdd: 'lightenHsl(primaryColor, 75%)', rowEven: 'lightenHsl(primaryColor, 1%)' },
  // v12 theme-default.js fills cScale and cScaleInv in its constructor, darkens cScale again
  // when it calculates, and never recomputes them: fixed lists that ignore the base colours.
  palettes: {
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
    cScaleLabel: paletteSlots((i) =>
      i === 0 || i === 3 ? 'invert(labelTextColor)' : 'labelTextColor'
    ),
  },
};

export default theme;
