import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * The mindmap's theme variables (spec #294 T4, D288; spec #414 T1b, D331), moved out of core
 * with their aliases: plain nodes drawn rounded with v12's redux paints, v12 neo's outlined
 * nodes, and edges in `nodeBorder`. `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
const MINDMAP: readonly string[] = ['mindmap'];

export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  mindmapRoundedNodes: { alias: 'mmr', kind: 'flag', usedBy: MINDMAP },
  mindmapOutlinedNodes: { alias: 'mmo', kind: 'flag', usedBy: MINDMAP },
  mindmapBorderEdges: { alias: 'mme', kind: 'flag', usedBy: MINDMAP },
};
