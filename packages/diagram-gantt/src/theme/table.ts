import type { DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/**
 * Gantt's theme table (`DiagramPlugin.theme`, D331, spec #414 T1b). Every colour is v12
 * theme-base's derivation from shared variables and literals (#381, #385), the same in every
 * theme but the classic family's entries below (contrast, #801, D574; bars on `mainBkg`, D657).
 * `vertLineColor` is the redux family's `primaryBorderColor` (v12 theme-base: navy); values only
 * a per-theme literal could give are in the spec #293 notes (GAPS #385).
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
      // Text on a critical bar (v12 `.critText0`, which took `taskTextColor`).
      critTextColor: 'taskTextColor',
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
    // in the derivation, for the classic family only (D574). The active outline, the `vert`
    // marker and its label take `lineColor`; text on a critical bar is black where the bar text
    // misses AA on red. Text on the other bars stays `taskTextColor`, the theme's text.
    // The bars and the third band (`sectionBkgColor2`) read `mainBkg`, which `default`, `forest`,
    // `neutral` and `dark` pin to their primary colour, so an author's `primaryColor` leaves them
    // alone there, as in v12; `base` derives `mainBkg` from it (D657). The lines read
    // `guideLineColor`, the line colour those four themes pin where v12 keeps its own under an
    // override (D656); in `base` it is `lineColor`. The first band is `mainBkg` moved away from
    // everything drawn on or beside it: darker than the page, the third band, the grid lines and
    // every bar fill in the light themes (darker than `lightgrey`, which the grid and the done
    // bars use), and darker than all of them in `dark`, where `mainBkg` is the darkest fill but
    // the page is lighter. A plain HSL darkening cannot do both for a pale saturated `mainBkg`
    // (`base`'s needs a deep step that leaves `default`'s too dark for its text), so the light
    // rule darkens a little in HSL and then mixes in black. v12's `default` has a lavender band,
    // its other themes pale ones the page barely tells apart (D726, amending D656's pin and
    // D541's rows; #1249). `conformance/src/gantt/theme.spec.ts` holds every classic theme to
    // 1.2:1 against `background`, `sectionBkgColor2`, `gridColor` and the bar fills, and to AA
    // for the text on the band. An author's `sectionBkgColor` still wins.
    classic: {
      rules: {
        sectionBkgColor: 'mix(darkenHsl(mainBkg, 10%), black, 18%)',
        sectionBkgColor2: 'mainBkg',
        taskBkgColor: 'mainBkg',
        activeTaskBkgColor: 'lightenHsl(mainBkg, 23%)',
        activeTaskBorderColor: 'guideLineColor',
        vertLineColor: 'guideLineColor',
        critTextColor: 'contrast(critBkgColor, taskTextColor, black)',
      },
      // Under a dark theme the critical fill darkens to #990000, on which the theme's light text
      // reads (maintainer's choice, D574). Text on active and done bars turns white where the
      // theme's misses AA on the grey active bar.
      dark: {
        rules: {
          sectionBkgColor: 'darkenHsl(mainBkg, 15%)',
          critBkgColor: 'darkenHsl(red, 20%)',
          taskTextDarkColor: 'contrast(activeTaskBkgColor, textColor, white)',
        },
      },
    },
  },
};
