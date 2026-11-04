/**
 * `default`: v12's classic lavender theme (`theme-default.js`).
 */
import type { ThemeSpec } from '../spec.ts';
import {
  CLASSIC_ARROWHEADS,
  CLASSIC_CLASS_MARKERS,
  CLASSIC_PADDING,
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
  },
  values: {
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
};

export default theme;
