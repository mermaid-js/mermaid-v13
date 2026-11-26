import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Block's own theme variables (spec #795 T4, D331): `pnpm gen:theme` writes the runtime half to
 * `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // #771: a composite without a palette slot takes the cluster paint, v12 classic's
  // `.node .cluster` rule (`clusterBkg` at 0.5, `clusterBorder` at 0.2); off, it takes the
  // leaves' `mainBkg` and `nodeBorder`, as v12 `look: neo` drew it.
  // An edge label's tag (#1349): its fill (edgeLabelBackground unless set, D715) and its ink
  // (textColor where it reads on the fill, D713).
  blockEdgeLabelBackground: { alias: 'beb', kind: 'color', usedBy: ['block'] },
  blockEdgeLabelColor: { alias: 'bel', kind: 'color', usedBy: ['block'] },
  blockCompositeClusterPaint: { alias: 'bcp', kind: 'flag', usedBy: ['block'] },
};
