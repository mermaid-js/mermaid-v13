import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * C4's theme table (`DiagramPlugin.theme`, D331, D456; `v13/docs/agents/runs/414/CONTRACT.md`).
 * v12 C4 is "fixed style": its relations and boundaries are `#444444` literals
 * (`svgDraw.ts:30-31, 141-142, 167-205`), its title takes the page's `textColor` (the root
 * `fill` of v12's style sheet), and its element palette is config. The light rules are those
 * values, so light themes draw what v12 drew; under a dark theme or `darkMode` (the `dark`
 * trait, never a theme name) relations take `lineColor` and boundaries `nodeBorder`, which v12
 * left dark on dark (D333(b)). The title's `textColor` is already the page's ink in both.
 * Every family takes the same rules: v12 C4 has no theme-name branch, gradient or shadow (D227).
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      c4RelationColor: '#444444',
      c4BoundaryColor: '#444444',
      c4TitleColor: 'textColor',
    },
    dark: {
      c4RelationColor: 'lineColor',
      c4BoundaryColor: 'nodeBorder',
      c4TitleColor: 'textColor',
    },
  },
};
