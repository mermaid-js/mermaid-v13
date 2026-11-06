import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * Sequence's own theme variables (spec #414 T2, D331): v12 names, so `themeVariables` and the
 * `--mermaid-<name>` CSS variables work as before. `pnpm gen:theme` writes the runtime half to
 * `generated/variables.ts`. The participant, signal, activation and number colours whose
 * values differ between themes of one family stay in core for now (GAPS.md "T2").
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  actorBkg: { alias: 'ab', kind: 'color', usedBy: ['sequence'] },
  actorLineColor: { alias: 'alc', kind: 'color', usedBy: ['sequence'] },
  labelBoxBkgColor: { alias: 'lbb', kind: 'color', usedBy: ['sequence'] },
  labelTextColor: { alias: 'ltc', kind: 'color', usedBy: ['sequence'] },
  loopTextColor: { alias: 'lpt', kind: 'color', usedBy: ['sequence'] },
  // Geometry (v12 `look: neo` / classic, #194), read as numbers at render time.
  actorRadius: { alias: 'arx', kind: 'length', usedBy: ['sequence'] },
  actorGlyphBand: { alias: 'agb', kind: 'length', usedBy: ['sequence'] },
  messageEndGap: { alias: 'meg', kind: 'length', usedBy: ['sequence'] },
  labelBoxExtraHeight: { alias: 'lbx', kind: 'length', usedBy: ['sequence'] },
  actorFooterPadding: { alias: 'afp', kind: 'length', usedBy: ['sequence'] },
};
