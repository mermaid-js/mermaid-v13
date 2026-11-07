import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * The timeline's theme variables (spec #414 T1, D331): its box geometry (spec #291, D227), moved
 * out of core with their aliases. `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // The top corner of a box.
  timelineRadius: { alias: 'tlr', kind: 'length', usedBy: ['timeline'] },
  // The label offset below a box's top (sections and periods).
  timelineLabelOffset: { alias: 'tlo', kind: 'padding', usedBy: ['timeline'] },
  // The extra offset of event labels.
  timelineEventLabelShift: { alias: 'tle', kind: 'length', usedBy: ['timeline'] },
  // Whether boxes take the `cScale` palettes.
  timelineScaleColors: { alias: 'tls', kind: 'flag', usedBy: ['timeline'] },
};
