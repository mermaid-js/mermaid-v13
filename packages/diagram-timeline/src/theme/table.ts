import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The timeline's theme table (D331, spec #414 T1): its geometry by family, never by theme name.
 *
 * - **redux** (v12 `svgDraw.js` and `styles.js` for the redux family's names): square corners,
 *   labels `padding` below the top (events `padding / 2 + 3`), and the `mainBkg` / `nodeBorder`
 *   paint with the border palette and the theme's shadow.
 * - **classic**, also the neo themes' (D227: v12 `theme: neo` drew classic timeline geometry):
 *   top corners 5, labels `padding / 2` below the top, `cScale` fills with a `cScaleInv` rule.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: { light: {} },
  families: {
    classic: {
      tokens: {
        timelineRadius: 5,
        timelineLabelOffset: '0.5 * padding',
        timelineEventLabelShift: 0,
        timelineScaleColors: true,
      },
    },
    redux: {
      tokens: {
        timelineRadius: 0,
        timelineLabelOffset: 'padding',
        timelineEventLabelShift: 3,
        timelineScaleColors: false,
      },
    },
    neo: { fallback: 'classic' },
  },
};
