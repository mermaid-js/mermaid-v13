import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Agentflow's own theme variables (D331). `flowContainerStroke` is v12's
 * `themeVariables.flowContainerStroke || secondaryBorderColor` (every v12 theme): the dashed
 * separator of a collapsed flow's card. The rules are on the table (`table.ts`). `pnpm gen:theme`
 * writes `generated/variables.ts` from this file.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  flowContainerStroke: { alias: 'afc', kind: 'color', usedBy: ['agentflow'] },
  // An edge label's tag (#1348): its fill (edgeLabelBackground unless set, D715) and its ink
  // (textColor where it reads on the fill, D713).
  agentflowEdgeLabelBackground: { alias: 'aeb', kind: 'color', usedBy: ['agentflow'] },
  agentflowEdgeLabelColor: { alias: 'ael', kind: 'color', usedBy: ['agentflow'] },
};
