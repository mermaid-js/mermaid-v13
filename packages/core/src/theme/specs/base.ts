/**
 * `base`: the theme meant for customising (v12 `theme-base.js`). It sets only the base
 * variables and tokens; every other colour comes from the shared rules (R-THEME-5).
 */
import type { ThemeSpec } from '../spec.ts';
import { CLASSIC_ARROWHEADS } from './geometry.ts';

const base: ThemeSpec = {
  name: 'base',
  dark: false,
  base: {
    primaryColor: '#fff4dd',
    secondaryColor: '#f4ddff',
    tertiaryColor: '#f6f9ff',
    background: '#f4f4f4',
    primaryTextColor: '#333333',
    lineColor: '#0b0b0b',
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
  },
};

export default base;
