/**
 * `neutral`: v12 `theme-neutral.js`, greys for print.
 */
import type { ThemeSpec } from '../spec.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING, CLASSIC_SEQUENCE } from './geometry.ts';

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
    ...CLASSIC_PADDING,
    ...CLASSIC_SEQUENCE,
  },
  values: {
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
  },
};

export default theme;
