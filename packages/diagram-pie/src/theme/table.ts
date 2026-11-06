import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The pie chart's text sizes, stroke widths and slice opacity: the same in every v12 theme
 * (`theme-*.js`, #325).
 */
const SIZES = {
  pieTitleTextSize: 25,
  pieSectionTextSize: 17,
  pieLegendTextSize: 17,
  pieStrokeWidth: 2,
  pieOuterStrokeWidth: 2,
  pieOpacity: 0.7,
} as const;

/**
 * The pie chart's theme table (D331, spec #414 T1). Every colour v12 sets per theme comes from
 * the theme's series palette (D332), read as the theme wrote each entry, so a slot a theme
 * derives from its base colours follows them: `pie<n>` is slot `n - 1`, and slots 20 and 21 are
 * the theme's inks for titles and legends (v12 `taskTextDarkColor`) and for labels on the series
 * colours. v12 12.2.0's resolved `getThemeVariables()` is the oracle
 * (`packages/conformance/src/pie/theme.spec.ts`). Strokes are black in every theme.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      ...Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`pie${i + 1}`, `seriesColorArray${i}`])
      ),
      pieTitleTextColor: 'seriesColorArray20',
      pieLegendTextColor: 'seriesColorArray20',
      pieSectionTextColor: 'seriesColorArray21',
      pieStrokeColor: 'black',
      pieOuterStrokeColor: 'black',
    },
  },
  families: { classic: { tokens: SIZES }, redux: { tokens: SIZES }, neo: { fallback: 'redux' } },
};
