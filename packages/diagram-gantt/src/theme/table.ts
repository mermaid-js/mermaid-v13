/**
 * Gantt's theme table (`DiagramPlugin.theme`, D331, spec #414 T1b). Every colour is v12
 * theme-base's derivation from shared variables and literals (#381, #385), the same in every
 * theme, so the table needs no family entry. `vertLineColor` is the redux family's
 * `primaryBorderColor` (v12 theme-base: navy); values only a per-theme literal could give are in
 * the spec #293 notes (GAPS #385).
 */
import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

export const theme: DiagramThemeTable = {
  vars: THEME_VARIABLE_TABLE,
  rules: {
    light: {
      sectionBkgColor: 'tertiaryColor',
      altSectionBkgColor: 'white',
      sectionBkgColor2: 'primaryColor',
      excludeBkgColor: '#eeeeee',
      taskBorderColor: 'primaryBorderColor',
      taskBkgColor: 'primaryColor',
      activeTaskBorderColor: 'primaryColor',
      activeTaskBkgColor: 'lightenHsl(primaryColor, 23%)',
      gridColor: 'lightgrey',
      doneTaskBkgColor: 'lightgrey',
      doneTaskBorderColor: 'grey',
      critBorderColor: '#ff8888',
      critBkgColor: 'red',
      todayLineColor: 'red',
      vertLineColor: 'primaryBorderColor',
      taskTextColor: 'textColor',
      taskTextOutsideColor: 'textColor',
      taskTextDarkColor: 'textColor',
    },
    // v12's redux and neo dark themes fill done tasks with `secondBkg`, khroma
    // lighten(mainBkg, 16) (#385).
    dark: { doneTaskBkgColor: 'lightenHsl(mainBkg, 16%)' },
  },
};
