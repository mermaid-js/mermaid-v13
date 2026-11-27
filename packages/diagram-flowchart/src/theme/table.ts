import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Flowchart's theme table (`DiagramPlugin.theme`, D331): the edge-label tag of flowchart and
 * swimlane (#1345). The tag is filled with the shared edgeLabelBackground (D628) unless flowchart
 * sets its own (D715), and inked with textColor where it reads there, else black or white,
 * whichever reads better (D713). An edge's `linkStyle … color` still wins as written.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      flowchartEdgeLabelBackground: 'edgeLabelBackground',
      flowchartEdgeLabelColor:
        'contrast(flowchartEdgeLabelBackground, textColor, contrast(flowchartEdgeLabelBackground, #000000, #ffffff))',
    },
  },
};
