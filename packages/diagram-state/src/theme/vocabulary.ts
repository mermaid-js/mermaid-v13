import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * State's own theme variables (spec #414 T3, D331, D337): v12 names, so `themeVariables` and the
 * `--mermaid-<name>` CSS variables work as before. `pnpm gen:theme` writes the runtime half to
 * `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // Composite states (#192, D120, D126): the body, the title strip and the alternate (nested)
  // body.
  compositeBackground: { alias: 'cbg', kind: 'color', usedBy: ['state'] },
  compositeTitleBackground: { alias: 'ctb', kind: 'color', usedBy: ['state'] },
  altBackground: { alias: 'alb', kind: 'color', usedBy: ['state'] },
  // State text and composite titles (D638, #827): v12's `stateLabelColor` drew both.
  stateLabelColor: { alias: 'stx', kind: 'color', usedBy: ['state'] },
  compositeTitleColor: { alias: 'ctc', kind: 'color', usedBy: ['state'] },
  // A transition label's tag (#1346): its fill (edgeLabelBackground unless set, D715) and its
  // ink (textColor where it reads on the fill, D713).
  stateEdgeLabelBackground: { alias: 'seb', kind: 'color', usedBy: ['state'] },
  stateEdgeLabelColor: { alias: 'sel', kind: 'color', usedBy: ['state'] },
};
