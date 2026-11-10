import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: usecase reads them all. */
const USECASE: readonly string[] = ['usecase'];

/**
 * Usecase's theme variables (spec #517, D331, D474): v12's eight role colours, flat names as v12
 * reads them (`styles.ts:51-60`), so the table has no section and the rows no nested key (D335).
 * The rules are on the table (`table.ts`). `pnpm gen:theme` writes `generated/variables.ts` from
 * them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  usecaseActorBkg: { alias: 'uab', kind: 'color', usedBy: USECASE },
  usecaseActorBorder: { alias: 'uar', kind: 'color', usedBy: USECASE },
  usecaseBkg: { alias: 'ucb', kind: 'color', usedBy: USECASE },
  usecaseBorder: { alias: 'ucr', kind: 'color', usedBy: USECASE },
  usecaseBoundaryBkg: { alias: 'ubb', kind: 'color', usedBy: USECASE },
  usecaseBoundaryBorder: { alias: 'ubr', kind: 'color', usedBy: USECASE },
  usecaseIncludeLine: { alias: 'uil', kind: 'color', usedBy: USECASE },
  usecaseExtendLine: { alias: 'uel', kind: 'color', usedBy: USECASE },
};

/**
 * The inventory doc's note (`v13/docs/theme-variables.md`): what the rows below do not show.
 */
export const THEME_NOTE =
  'With a palette (a non-empty `borderColorArray`: redux-color, redux-dark-color, or an author’s) each system boundary takes its own palette slot over `usecaseBoundaryBkg`/`usecaseBoundaryBorder`, and under `usecase.colorScheme: rotate` each actor and use case does too.';
