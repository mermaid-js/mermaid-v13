import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: venn reads them all. */
const VENN: readonly string[] = ['venn'];

/**
 * Venn's theme variables (spec #429; spec #414 T0b, D331): v12's ten flat names, the slot
 * colours `venn1`–`venn8` and the two text inks. v12 reads no nested `venn` block, so the table
 * has no section and the rows no nested key (D335). The rules are on the table (`table.ts`).
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  venn1: { alias: 'vn1', kind: 'color', usedBy: VENN },
  venn2: { alias: 'vn2', kind: 'color', usedBy: VENN },
  venn3: { alias: 'vn3', kind: 'color', usedBy: VENN },
  venn4: { alias: 'vn4', kind: 'color', usedBy: VENN },
  venn5: { alias: 'vn5', kind: 'color', usedBy: VENN },
  venn6: { alias: 'vn6', kind: 'color', usedBy: VENN },
  venn7: { alias: 'vn7', kind: 'color', usedBy: VENN },
  venn8: { alias: 'vn8', kind: 'color', usedBy: VENN },
  vennTitleTextColor: { alias: 'vnt', kind: 'color', usedBy: VENN },
  vennSetTextColor: { alias: 'vns', kind: 'color', usedBy: VENN },
};

/**
 * The inventory doc's note (`v13/docs/theme-variables.md`): what the slot rows below do not show.
 */
export const THEME_NOTE =
  'A theme with a palette (a non-empty `borderColorArray`: redux-color, redux-dark-color, or an author’s) draws the circles from it, not from these slot values; `currentColor` is a slot no theme writes, and the circles cycle the slots that are written, else fall back to `primaryColor`.';
