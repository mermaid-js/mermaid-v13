import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Gantt's theme table (`DiagramPlugin.theme`, D331, spec #414 T1b). Every colour is v12
 * theme-base's derivation from shared variables and literals (#381, #385), the same in every
 * theme but the classic family's contrast entries below (#801). `vertLineColor` is the redux
 * family's `primaryBorderColor` (v12 theme-base: navy); values only a per-theme literal could
 * give are in the spec #293 notes (GAPS #385).
 */
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
  families: {
    // The classic themes' pale primary left the active bar's outline, the `vert` marker and the
    // text on red near invisible (#772): spec #795 decision 2, option (a), repairs the contrast
    // in the derivation, for the classic family only. The active outline is `primaryBorderColor`
    // where that reads on the bar, else `lineColor`; the `vert` marker and its label take
    // `lineColor`; text on a critical bar is black where the theme's text misses AA on red.
    classic: {
      rules: {
        activeTaskBorderColor: 'contrast(activeTaskBkgColor, primaryBorderColor, lineColor)',
        vertLineColor: 'lineColor',
        taskTextColor: 'contrast(critBkgColor, textColor, black)',
      },
      // Under a dark theme no one ink reads on both pure red and the dark bars, which share
      // `taskTextColor`: the critical fill darkens to #990000 and that text stays the theme's
      // light text. Text on active and done bars turns white where the theme's misses AA on the
      // grey active bar.
      dark: {
        rules: {
          critBkgColor: 'darkenHsl(red, 20%)',
          taskTextColor: 'textColor',
          taskTextDarkColor: 'contrast(activeTaskBkgColor, textColor, white)',
        },
      },
    },
  },
};
