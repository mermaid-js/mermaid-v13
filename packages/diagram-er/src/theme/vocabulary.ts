import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/**
 * ER's own theme variables (spec #414 T3, D331): v12 names (and v13's crow's-foot geometry), so
 * `themeVariables` and the `--mermaid-<name>` CSS variables work as before. `pnpm gen:theme`
 * writes the runtime half to `generated/variables.ts`.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  // Tables and ends (#133): v12's row fills, its colour-theme edge label background and the
  // zero circle's fill (white in v12 classic, the node fill in v12 neo).
  rowOdd: { alias: 'ro', kind: 'color', usedBy: ['er'] },
  rowEven: { alias: 're', kind: 'color', usedBy: ['er'] },
  erEdgeLabelBackground: { alias: 'eel', kind: 'color', usedBy: ['er'] },
  erMarkerFill: { alias: 'emf', kind: 'color', usedBy: ['er'] },
  // Attribute text on each row (#758): the ink against that row's own fill, as nodeTextColor is
  // against the entity's; the header keeps nodeTextColor.
  erRowOddTextColor: { alias: 'eot', kind: 'color', usedBy: ['er'] },
  erRowEvenTextColor: { alias: 'eet', kind: 'color', usedBy: ['er'] },
  // Crow's-foot ends (D152): where the zero-or-more circle sits, out from the outline, read as
  // a number at render time.
  erZeroOrMoreCircleOffset: { alias: 'ezc', kind: 'length', usedBy: ['er'] },
};
