import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Flowchart's own theme variables (D331, D715). The rules are on the table (`table.ts`).
 * `pnpm gen:theme` writes `generated/variables.ts` from this file.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // An edge label's tag (#1345), swimlane's too: its fill (edgeLabelBackground unless set, D715)
  // and its ink (textColor where it reads on the fill, D713).
  flowchartEdgeLabelBackground: { alias: 'feb', kind: 'color', usedBy: ['flowchart'] },
  flowchartEdgeLabelColor: { alias: 'fel', kind: 'color', usedBy: ['flowchart'] },
};
