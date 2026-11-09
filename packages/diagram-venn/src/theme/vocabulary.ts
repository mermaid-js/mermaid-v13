import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';
import { slotVar, VENN_SLOTS } from './slots.ts';

/** `usedBy` of every row: venn reads them all. */
const VENN: readonly string[] = ['venn'];

/** The slot rows `venn1`–`venn8` (`vn1`–`vn8`), one per slot of `slots.ts`. */
const SLOT_ROWS: Record<string, DiagramThemeVarDef> = Object.fromEntries(
  Array.from({ length: VENN_SLOTS }, (_, i): [string, DiagramThemeVarDef] => [
    slotVar(i),
    { alias: `vn${i + 1}`, kind: 'color', usedBy: VENN },
  ])
);

/**
 * Venn's theme variables (spec #429; spec #414 T0b, D331): v12's ten flat names, the slot
 * colours `venn1`–`venn8` and the two text inks. v12 reads no nested `venn` block, so the table
 * has no section and the rows no nested key (D335). The rules are on the table (`table.ts`).
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  ...SLOT_ROWS,
  vennTitleTextColor: { alias: 'vnt', kind: 'color', usedBy: VENN },
  vennSetTextColor: { alias: 'vns', kind: 'color', usedBy: VENN },
};

/**
 * The inventory doc's note (`v13/docs/theme-variables.md`): what the slot rows below do not show.
 */
export const THEME_NOTE =
  'A theme with a palette (a non-empty `borderColorArray`: redux-color, redux-dark-color, or an author’s) draws the circles from it, not from these slot values; `currentColor` is a slot no theme writes, and the circles cycle the slots that are written, else fall back to `primaryColor`.';
