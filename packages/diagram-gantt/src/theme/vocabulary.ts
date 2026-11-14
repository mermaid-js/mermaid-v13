import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: gantt reads them all. */
const GANTT: readonly string[] = ['gantt'];

/**
 * Gantt's theme variables (#381, v12 names from v12's gantt `styles.js`; spec #414 T1b, D331),
 * moved out of core with their aliases: row bands, excluded days, grid, today and `vert` lines,
 * bars by state, and task label colours. A clickable label is v12's #003163 in every theme, a
 * renderer constant (#385). `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  sectionBkgColor: { alias: 'gb0', kind: 'color', usedBy: GANTT },
  altSectionBkgColor: { alias: 'gb1', kind: 'color', usedBy: GANTT },
  sectionBkgColor2: { alias: 'gb2', kind: 'color', usedBy: GANTT },
  excludeBkgColor: { alias: 'gxb', kind: 'color', usedBy: GANTT },
  gridColor: { alias: 'ggc', kind: 'color', usedBy: GANTT },
  todayLineColor: { alias: 'gtl', kind: 'color', usedBy: GANTT },
  vertLineColor: { alias: 'gvl', kind: 'color', usedBy: GANTT },
  taskBkgColor: { alias: 'gtb', kind: 'color', usedBy: GANTT },
  taskBorderColor: { alias: 'gto', kind: 'color', usedBy: GANTT },
  activeTaskBkgColor: { alias: 'gab', kind: 'color', usedBy: GANTT },
  activeTaskBorderColor: { alias: 'gao', kind: 'color', usedBy: GANTT },
  doneTaskBkgColor: { alias: 'gdb', kind: 'color', usedBy: GANTT },
  doneTaskBorderColor: { alias: 'gdo', kind: 'color', usedBy: GANTT },
  critBkgColor: { alias: 'gcb', kind: 'color', usedBy: GANTT },
  critBorderColor: { alias: 'gco', kind: 'color', usedBy: GANTT },
  taskTextColor: { alias: 'gtt', kind: 'color', usedBy: GANTT },
  critTextColor: { alias: 'gct', kind: 'color', usedBy: GANTT },
  taskTextOutsideColor: { alias: 'gtx', kind: 'color', usedBy: GANTT },
  taskTextDarkColor: { alias: 'gtd', kind: 'color', usedBy: GANTT },
};
