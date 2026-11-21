/**
 * Cynefin's own theme table, `DiagramPlugin.theme` (D331, spec #414 T0a, CONTRACT.md): v12's
 * fifteen `themeVariables.cynefin.*` variables (the cynefin block of `theme-*.js`), declared in
 * `vocabulary.ts` as flat `cynefin…` names under the nested section `cynefin` (D335, D540),
 * keyed by theme trait, never by theme name:
 *
 * - **light** (every family, the fallback): v12 `default`'s five backgrounds and cliff, the
 *   boundaries and arrows in `canvasLineColor`, text in `textColor`, labels in
 *   `canvasTextColor`; the five lengths as tokens of every family. This is v12 in `default`,
 *   `neutral` and `base`. The canvas inputs are `lineColor` and `primaryTextColor`, except where
 *   a theme pins them because v12 keeps its block under an override of those (D656).
 * - **dark** (a dark theme's own trait, not the author's `darkMode`, as v12's literals did not
 *   follow it): v12 `dark`'s five backgrounds and cliff, over the light entries.
 *
 * The redux and neo families take the same entries (`fallback: 'classic'`), so they derive from
 * their own colours and their dark themes take the dark entry (R-THEME-11), where v12 left them
 * on `default`'s literals. v12 `forest`'s own literals have no trait to key them by; forest takes
 * the light entry (T5's oracle lists it, D333(b), D541).
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

export const theme: DiagramThemeTable = {
  section: 'cynefin',
  vars: THEME_VARIABLE_TABLE,
  rules: {
    // v12 theme-default.js :298-315.
    light: {
      cynefinComplexBg: '#E8F5E9',
      cynefinComplicatedBg: '#E3F2FD',
      cynefinChaoticBg: '#FBE9E7',
      cynefinClearBg: '#FFF8E1',
      cynefinConfusionBg: '#F3E5F5',
      cynefinBoundaryColor: 'canvasLineColor',
      cynefinCliffColor: '#8B0000',
      cynefinArrowColor: 'canvasLineColor',
      cynefinTextColor: 'textColor',
      cynefinLabelColor: 'canvasTextColor',
    },
  },
  families: {
    classic: {
      tokens: {
        cynefinDomainFontSize: 16,
        cynefinItemFontSize: 12,
        cynefinBoundaryWidth: 2,
        cynefinCliffWidth: 4,
        cynefinArrowWidth: 2,
      },
      // v12 theme-dark.js :265-282.
      dark: {
        values: {
          cynefinComplexBg: '#1B5E20',
          cynefinComplicatedBg: '#0D47A1',
          cynefinChaoticBg: '#BF360C',
          cynefinClearBg: '#F57F17',
          cynefinConfusionBg: '#4A148C',
          cynefinCliffColor: '#FF6B6B',
        },
      },
    },
    redux: { fallback: 'classic' },
    neo: { fallback: 'classic' },
  },
};
