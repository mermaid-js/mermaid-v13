import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: cynefin reads them all. */
const CYNEFIN: readonly string[] = ['cynefin'];

/**
 * Cynefin's theme variables (spec #423; spec #414 T0b, D331): v12's fifteen
 * `themeVariables.cynefin.*` keys as flat `cynefin…` names, each with its nested key under the
 * table's `cynefin` section (D335, D540). `pnpm gen:theme` writes `generated/variables.ts` from
 * them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  cynefinComplexBg: { alias: 'cnx', kind: 'color', usedBy: CYNEFIN, nested: 'complexBg' },
  cynefinComplicatedBg: { alias: 'cnp', kind: 'color', usedBy: CYNEFIN, nested: 'complicatedBg' },
  cynefinChaoticBg: { alias: 'cnh', kind: 'color', usedBy: CYNEFIN, nested: 'chaoticBg' },
  cynefinClearBg: { alias: 'cnc', kind: 'color', usedBy: CYNEFIN, nested: 'clearBg' },
  cynefinConfusionBg: { alias: 'cnf', kind: 'color', usedBy: CYNEFIN, nested: 'confusionBg' },
  cynefinBoundaryColor: { alias: 'cnb', kind: 'color', usedBy: CYNEFIN, nested: 'boundaryColor' },
  cynefinCliffColor: { alias: 'cnl', kind: 'color', usedBy: CYNEFIN, nested: 'cliffColor' },
  cynefinArrowColor: { alias: 'cna', kind: 'color', usedBy: CYNEFIN, nested: 'arrowColor' },
  cynefinTextColor: { alias: 'cnt', kind: 'color', usedBy: CYNEFIN, nested: 'textColor' },
  cynefinLabelColor: { alias: 'cnn', kind: 'color', usedBy: CYNEFIN, nested: 'labelColor' },
  cynefinDomainFontSize: {
    alias: 'cnds',
    kind: 'length',
    usedBy: CYNEFIN,
    nested: 'domainFontSize',
  },
  cynefinItemFontSize: { alias: 'cnis', kind: 'length', usedBy: CYNEFIN, nested: 'itemFontSize' },
  cynefinBoundaryWidth: {
    alias: 'cnbw',
    kind: 'length',
    usedBy: CYNEFIN,
    nested: 'boundaryWidth',
  },
  cynefinCliffWidth: { alias: 'cnlw', kind: 'length', usedBy: CYNEFIN, nested: 'cliffWidth' },
  cynefinArrowWidth: { alias: 'cnaw', kind: 'length', usedBy: CYNEFIN, nested: 'arrowWidth' },
};
