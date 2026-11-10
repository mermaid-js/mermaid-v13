import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: architecture reads them all. */
const ARCHITECTURE: readonly string[] = ['architecture'];

/**
 * Architecture's theme variables (D331, spec #525 "Integration"): v12's five flat `arch*`
 * variables (`architectureTypes.ts:185-191`), read by `architectureStyles.ts` for the edges,
 * their arrowheads and the group borders. Flat, with no nested section: v12 never read them
 * under one. They are not core's (R-PERF-8). `pnpm gen:theme` writes `generated/variables.ts`
 * from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  archEdgeColor: { alias: 'aec', kind: 'color', usedBy: ARCHITECTURE },
  archEdgeArrowColor: { alias: 'aea', kind: 'color', usedBy: ARCHITECTURE },
  archEdgeWidth: { alias: 'aew', kind: 'length', usedBy: ARCHITECTURE },
  archGroupBorderColor: { alias: 'agc', kind: 'color', usedBy: ARCHITECTURE },
  archGroupBorderWidth: { alias: 'agw', kind: 'length', usedBy: ARCHITECTURE },
};
