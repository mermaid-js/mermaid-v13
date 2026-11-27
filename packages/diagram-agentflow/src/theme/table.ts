import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Agentflow's theme table (`DiagramPlugin.theme`, D331; `v13/docs/agents/runs/414/CONTRACT.md`):
 * `flowContainerStroke` is `secondaryBorderColor` in every theme, as v12 derived it in each of
 * its eleven theme files. An author's `flowContainerStroke` (flat) still wins.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      flowContainerStroke: 'secondaryBorderColor',
      // An edge label's tag: filled with the shared edgeLabelBackground (D628) unless agentflow
      // sets its own (D715), and inked with textColor where it reads there, else black or white,
      // whichever reads better (D713, #1348). An edge's own text colour still wins as written.
      agentflowEdgeLabelBackground: 'edgeLabelBackground',
      agentflowEdgeLabelColor:
        'contrast(agentflowEdgeLabelBackground, textColor, contrast(agentflowEdgeLabelBackground, #000000, #ffffff))',
    },
  },
};
