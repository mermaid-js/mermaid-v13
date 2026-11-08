/**
 * `base`: the theme meant for customising (v12 `theme-base.js`). It sets only the base
 * variables and tokens; every other colour comes from the shared rules (R-THEME-5).
 */
import type { ThemeSpec } from '../spec.ts';
import { BASE_PLOT, BASE_SECONDARY, LABEL_SCALE, series } from './palettes.ts';
import { darkenedScale, gitPalettes, gitSources, hueSources } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING } from './geometry.ts';

// v12 derives secondaryColor and tertiaryColor from primaryColor in HSL; the palette keeps
// that derivation, where the base variables are its hex.
const SECONDARY = BASE_SECONDARY;
const TERTIARY = 'ifSet(tertiaryColor, lightenHsl(adjustHue(primaryColor, 180), 5%))';
const SOURCES = hueSources(true, 'primaryColor', SECONDARY, TERTIARY);
const GIT = gitSources('primaryColor', SECONDARY, TERTIARY);

const base: ThemeSpec = {
  name: 'base',
  dark: false,
  family: 'classic',
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
    ...CLASSIC_PADDING,
    useGradient: false,
  },
  // v12 theme-base.js: hue steps darkened by 25 (75 under darkMode); git darkened by 25
  // (lightened under darkMode, with black branch labels).
  palettes: {
    plotColorArray: BASE_PLOT,
    ...darkenedScale(SOURCES, 25),
    cScaleLabel: LABEL_SCALE,
    // v12 theme-base.js: the base colours, then khroma `darken` by 10, then hue turns, which are
    // base's resolved v12 values; the tints are the primary and secondary colours and v12's
    // resolved ±64° and 128° turns of base's own.
    seriesColorArray: series(
      'primaryColor secondaryColor tertiaryColor darkenHsl(primaryColor,10%) darkenHsl(secondaryColor,10%) darkenHsl(tertiaryColor,10%) #c5ffaa #ffaac5 #ddfff4 #a3ff77 #ff77a3 #aaffe3 ' +
        'primaryColor secondaryColor #e6ffdd #ffdde6 #ffddea #ddeaff #ddfff9 #fff9dd'
    ),
    ...gitPalettes(GIT),
  },
  darkModePalettes: {
    ...darkenedScale(SOURCES, 75),
    ...gitPalettes(GIT, 'lightenHsl', 'black'),
  },
};

export default base;
