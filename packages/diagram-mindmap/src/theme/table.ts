import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * The mindmap's theme table (`DiagramPlugin.theme`, D331, spec #414 T1b): its three paint flags
 * by family (D288). Its root reads the shared `git` and `gitBranchLabel` palettes (slot 0) and
 * its levels `cScale`, `cScaleInv` and `cScaleLabel`, all core's.
 */
export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: { light: {} },
  families: {
    // v12 classic: plain nodes with four rounded corners and a rule, no outline, `cScale` edges.
    classic: {
      tokens: {
        mindmapRoundedNodes: false,
        mindmapOutlinedNodes: false,
        mindmapBorderEdges: false,
      },
    },
    // v12's redux themes (`mindmapDb.ts` and `styles.ts` for a redux theme name): plain
    // nodes rounded, v12 neo's outlined nodes, edges in `nodeBorder`.
    redux: {
      tokens: { mindmapRoundedNodes: true, mindmapOutlinedNodes: true, mindmapBorderEdges: true },
    },
    // v12's neo theme (`look: neo`): outlined nodes, plain ones flat-bottomed, `cScale` edges;
    // the family's dark theme draws its edges in `nodeBorder`, as the redux themes do (v12
    // `styles.ts`).
    neo: {
      tokens: { mindmapRoundedNodes: false, mindmapOutlinedNodes: true, mindmapBorderEdges: false },
      dark: { tokens: { mindmapBorderEdges: true } },
    },
  },
};
