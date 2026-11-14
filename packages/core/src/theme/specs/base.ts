/**
 * `base`: the theme meant for customising (v12 `theme-base.js`). It sets only the base
 * variables and tokens; every other colour comes from the shared rules (R-THEME-5). Like v12, it
 * derives `secondaryColor` and `tertiaryColor` from `primaryColor`, and `lineColor` and
 * `arrowheadColor` from `background`, unless the author sets them (#797); its error colours follow
 * the tertiary ones, and its note colours are v12's constructor literals (#825).
 */
import type { ThemeSpec } from '../spec.ts';
import { BASE_PLOT, LABEL_SCALE, series } from './palettes.ts';
import { darkenedScale, gitPalettes, gitSources, hueSources } from './scales.ts';
import { CLASSIC_ARROWHEADS, CLASSIC_PADDING } from './geometry.ts';

const SOURCES = hueSources(true);
const GIT = gitSources('primaryColor', 'secondaryColor', 'tertiaryColor');

const base: ThemeSpec = {
  name: 'base',
  dark: false,
  family: 'classic',
  base: {
    primaryColor: '#fff4dd',
    // v12 adjust(primaryColor, { h: -120 }) and { h: 180, l: 5 }: #f4ddff and #f6f9ff.
    secondaryColor: 'adjustHue(primaryColor, -120)',
    tertiaryColor: 'lightenHsl(adjustHue(primaryColor, 180), 5%)',
    background: '#f4f4f4',
    primaryTextColor: '#333333',
    // v12 invert(background): #0b0b0b.
    lineColor: 'invert(background)',
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
  // v12 theme-base.js sets the note colours in its constructor, so neither darkMode nor
  // primaryTextColor moves them (#825).
  values: { noteBkgColor: '#fff5ad', noteTextColor: '#333333' },
  rules: {
    // v12 derives arrowheadColor from background too, so an author's lineColor leaves it (#797).
    arrowheadColor: 'invert(background)',
    // v12 theme-base.js draws errors in the tertiary colours (#825).
    errorBkgColor: 'tertiaryColor',
    errorTextColor: 'tertiaryTextColor',
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
