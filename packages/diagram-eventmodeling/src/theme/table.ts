/**
 * Event modeling's own theme table, `DiagramPlugin.theme` (spec #527 Q7, D527; D331, spec #414
 * T0a, `v13/docs/agents/runs/414/CONTRACT.md`): v12's 14 flat `em*` variables and
 * `emTextColor`, keyed by theme trait, never by theme name, with no nested section (v12 read
 * none):
 *
 * - **light** (every family): v12 `default`'s literals (`theme-default.js:457-470`, the same in
 *   `forest`, `neutral` and `base`), relations and heads in `lineColor`, text in `textColor`.
 * - **dark** (a dark theme's own trait, not the author's `darkMode`, which v12's literals did not
 *   follow): v12 `dark`'s values (`theme-dark.js:419-433`): `#2d2d2d`/`#555` for UI, the kind
 *   hues `lighten(…, 10)` as literals, lanes `lighten(background, 5)` and `(…, 12)`; relations
 *   and heads stay on `lineColor`.
 *
 * The redux and neo families take the classic entries (`fallback: 'classic'`), so `neo-dark`,
 * `redux-dark` and `redux-dark-color` take the dark ones, where v12 drew those six themes with
 * `default`'s pastels and `#000` arrows (no `em*` there): T5 lists each in `DIFFERENCES`
 * (D333(b)).
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      emUiFill: '#ffffff',
      emUiStroke: '#dbdada',
      emProcessorFill: '#edb3f6',
      emProcessorStroke: '#b88cbf',
      emReadModelFill: '#d3f1a2',
      emReadModelStroke: '#a3b732',
      emCommandFill: '#bcd6fe',
      emCommandStroke: '#679ac3',
      emEventFill: '#ffb778',
      emEventStroke: '#c19a0f',
      emSwimlaneBackgroundOdd: '#fafafa',
      emSwimlaneBackgroundStroke: '#f0f0f0',
      emRelationStroke: 'lineColor',
      emArrowhead: 'lineColor',
      emTextColor: 'textColor',
    },
  },
  families: {
    classic: {
      dark: {
        values: {
          emUiFill: '#2d2d2d',
          emUiStroke: '#555555',
          // khroma's lighten(#5a3d5c, 10) and the others: hsl(296.13, 20.26%, 40%) and so on.
          emProcessorFill: '#78517b',
          emProcessorStroke: '#8a6d8c',
          emReadModelFill: '#547c3e',
          emReadModelStroke: '#6d8c5c',
          emCommandFill: '#3e547c',
          emCommandStroke: '#5c6d8c',
          emEventFill: '#7c5f3e',
          emEventStroke: '#8c755c',
        },
        rules: {
          emSwimlaneBackgroundOdd: 'lightenHsl(background, 5%)',
          emSwimlaneBackgroundStroke: 'lightenHsl(background, 12%)',
        },
      },
    },
    redux: { fallback: 'classic' },
    neo: { fallback: 'classic' },
  },
};
