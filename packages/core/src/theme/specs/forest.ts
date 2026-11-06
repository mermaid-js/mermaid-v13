/**
 * `forest`: v12 `theme-forest.js`.
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

/** v12 `theme-forest.js`: primary and secondary −30, then hue turns. */
const PIE_FOREST: ThemeRuleTable = pieSlots([
  undefined,
  undefined,
  undefined,
  'darkenHsl(primaryColor, 30%)',
  'darkenHsl(secondaryColor, 30%)',
  '#33b42f',
  '#70d990',
  '#d99070',
  '#98cde4',
  '#1a6330',
  '#63301a',
  '#1a4d63',
]);

const theme: ThemeSpec = {
  name: 'forest',
  dark: false,
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
    ...CLASSIC_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...CLASSIC_PADDING,
    ...CLASSIC_SEQUENCE,
    useGradient: false,
  },
  // v12 theme-forest: khroma lighten(mainBkg, 20), exactly (D117).
  rules: { rowEven: 'lightenHsl(mainBkg, 20%)', ...PIE_FOREST },
  values: {
    altBackground: '#f0f0f0', // v12 (#192)
    // sequence (v12 theme-forest.js: actorBorder is darken(mainBkg, 20))
    actorBorder: '#a6cf47',
    actorTextColor: '#000000',
    signalColor: '#333333',
    signalTextColor: '#333333',
    labelBoxBorderColor: '#326932',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
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
};

export default theme;
