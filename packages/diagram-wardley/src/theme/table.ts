import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The Wardley map's theme table (`DiagramPlugin.theme`, D322, D331, spec #430 "v13 entries"):
 * the thirteen variables of `vocabulary.ts` under the `wardley` section (D335, D540), each a
 * rule over the shared vocabulary as v12's classic `wardley` block is
 * (`theme-default.js:356-371`; base, forest and neutral the same; dark `:351-366`):
 *
 * - **light** (every family): the background and the fills `canvasBkg`; the axes, strokes and
 *   links `canvasLineColor`; the text `canvasTextColor`; the evolution `wardleyEvolutionColor`,
 *   `#dc3545`. The canvas inputs are `background`, `lineColor` and `primaryTextColor`, except
 *   where a theme pins them because v12 kept its block under an override of those (D656).
 * - **dark** (a dark theme's own trait, not the author's `darkMode`, which v12's classic block
 *   never read): the fills `mainBkg`, the evolution `#ff6b6b`.
 *
 * This equals v12 in the five classic themes, but for neutral's grid (below). The redux and neo
 * families take the same entries (`fallback: 'classic'`): v12 gives them no block, so their
 * values are D333(b) (T5's oracle lists them). `wardleyGridColor` is the literal `lightgrey`,
 * as gantt's `gridColor` (a gantt row a wardley rule may not read): v12's value in default, base,
 * dark and forest; neutral's `hsl(0, 0%, 90%)` is a family-rule approximation (GAPS #430).
 */
export const theme: DiagramThemeTable = {
  section: 'wardley',
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      wardleyBackgroundColor: 'canvasBkg',
      wardleyAxisColor: 'canvasLineColor',
      wardleyAxisTextColor: 'canvasTextColor',
      wardleyGridColor: 'lightgrey',
      wardleyComponentFill: 'canvasBkg',
      wardleyComponentStroke: 'canvasLineColor',
      wardleyComponentLabelColor: 'canvasTextColor',
      wardleyLinkStroke: 'canvasLineColor',
      wardleyEvolutionColor: '#dc3545',
      wardleyEvolutionStroke: 'wardleyEvolutionColor',
      wardleyAnnotationStroke: 'canvasLineColor',
      wardleyAnnotationTextColor: 'canvasTextColor',
      wardleyAnnotationFill: 'canvasBkg',
    },
  },
  families: {
    classic: {
      dark: {
        rules: { wardleyComponentFill: 'mainBkg', wardleyAnnotationFill: 'mainBkg' },
        values: { wardleyEvolutionColor: '#ff6b6b' },
      },
    },
    redux: { fallback: 'classic' },
    neo: { fallback: 'classic' },
  },
};
