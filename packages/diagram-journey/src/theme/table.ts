import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The user journey's theme table (D331, spec #414 T1). The section fills `fillType0`–`fillType7`
 * (#327, D241) are slots 12–19 of the theme's series palette (D332), its tints after the twelve
 * series colours, read as the theme wrote each entry: v12 derives them from `primaryColor`,
 * `secondaryColor` and their hue turns by ±64° and 128°, and each theme carries v12 12.2.0's
 * resolved values (checked by `packages/conformance/src/journey/theme.spec.ts`); `base`'s first
 * two follow its base colours. v12 journey `.face { fill: faceColor or #FFF8DC }`, and no v12
 * theme sets `faceColor`. The actor colours have no rule: an author sets them (D249).
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      ...Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [`fillType${i}`, `seriesColorArray${12 + i}`])
      ),
      faceColor: '#fff8dc',
    },
  },
};
