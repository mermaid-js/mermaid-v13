/**
 * `base`: the theme meant for customising (v12 `theme-base.js`). It sets only the base
 * variables and tokens; every other colour comes from the shared rules (R-THEME-5).
 */
import type { ThemeSpec } from '../spec.ts';
import { BASE_SECONDARY, LABEL_SCALE } from './palettes.ts';
import { darkenedScale, gitPalettes, gitSources, hueSources } from './scales.ts';
import {
  CLASSIC_ARROWHEADS,
  CLASSIC_CLASS_MARKERS,
  CLASSIC_PADDING,
  CLASSIC_SEQUENCE,
  CLASSIC_TIMELINE,
  CLASSIC_GITGRAPH,
  TEXT_SIZES,
} from './geometry.ts';

// v12 derives secondaryColor and tertiaryColor from primaryColor in HSL; the palette keeps
// that derivation, where the base variables are its hex.
const SECONDARY = BASE_SECONDARY;
const TERTIARY = 'ifSet(tertiaryColor, lightenHsl(adjustHue(primaryColor, 180), 5%))';
const SOURCES = hueSources(true, 'primaryColor', SECONDARY, TERTIARY);
const GIT = gitSources('primaryColor', SECONDARY, TERTIARY);

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
    ...CLASSIC_CLASS_MARKERS,
    ...TEXT_SIZES,
    ...CLASSIC_PADDING,
    ...CLASSIC_SEQUENCE,
    ...CLASSIC_TIMELINE,
    ...CLASSIC_GITGRAPH,
    useGradient: false,
  },
  // v12 theme-base.js: hue steps darkened by 25 (75 under darkMode); git darkened by 25
  // (lightened under darkMode, with black branch labels).
  palettes: {
    ...darkenedScale(SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    ...gitPalettes(GIT),
  },
  darkModePalettes: {
    ...darkenedScale(SOURCES, 75),
    ...gitPalettes(GIT, 'lightenHsl', 'black'),
  },
};

export default base;
