/**
 * #1037 (spec #1035 T0, D654): gantt's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { gantt } from '@mermaid-js/diagram-gantt';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's gantt colours: `capture-theme-overrides.ts gantt`. */
const V12: ReferenceTable = {
  default: {
    sectionBkgColor: '#6666ff7d',
    altSectionBkgColor: '#ffffff',
    sectionBkgColor2: '#fff400',
    excludeBkgColor: '#eeeeee',
    gridColor: '#d3d3d3',
    todayLineColor: '#ff0000',
    vertLineColor: '#000080',
    taskBkgColor: '#8a90dd',
    taskBorderColor: '#534fbc',
    activeTaskBkgColor: '#bfc7ff',
    activeTaskBorderColor: '#534fbc',
    doneTaskBkgColor: '#d3d3d3',
    doneTaskBorderColor: '#808080',
    critBkgColor: '#ff0000',
    critBorderColor: '#ff8888',
    taskTextColor: '#ffffff',
    taskTextOutsideColor: '#000000',
    taskTextDarkColor: '#000000',
  },
  dark: {
    sectionBkgColor: '#b4ac76',
    altSectionBkgColor: {
      none: '#333333',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    sectionBkgColor2: '#eae8d9',
    excludeBkgColor: '#9f9758',
    gridColor: '#d3d3d3',
    todayLineColor: '#db5757',
    vertLineColor: '#00bfff',
    taskBkgColor: { none: '#595c5c', 'mainBkg:light': '#fff6db', 'mainBkg:dark': '#508ab9' },
    taskBorderColor: '#ffffff',
    activeTaskBkgColor: '#81b1db',
    activeTaskBorderColor: '#ffffff',
    doneTaskBkgColor: '#d3d3d3',
    doneTaskBorderColor: '#808080',
    critBkgColor: '#e83737',
    critBorderColor: '#e83737',
    taskTextColor: '#e2dcd6',
    taskTextOutsideColor: '#d3d3d3',
    taskTextDarkColor: '#2c2c2c',
  },
  forest: {
    sectionBkgColor: '#6eaa49',
    altSectionBkgColor: '#ffffff',
    sectionBkgColor2: '#6eaa49',
    excludeBkgColor: '#eeeeee',
    gridColor: '#d3d3d3',
    todayLineColor: '#ff0000',
    vertLineColor: '#00bfff',
    taskBkgColor: '#487e3a',
    taskBorderColor: '#13540c',
    activeTaskBkgColor: { none: '#cde498', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    activeTaskBorderColor: '#13540c',
    doneTaskBkgColor: '#d3d3d3',
    doneTaskBorderColor: '#808080',
    critBkgColor: '#ff0000',
    critBorderColor: '#ff8888',
    taskTextColor: '#ffffff',
    taskTextOutsideColor: '#000000',
    taskTextDarkColor: '#000000',
  },
  neutral: {
    sectionBkgColor: '#bdbdbd',
    altSectionBkgColor: '#ffffff',
    sectionBkgColor2: '#bdbdbd',
    excludeBkgColor: '#eeeeee',
    gridColor: '#e6e6e6',
    todayLineColor: '#dd4422',
    vertLineColor: '#dd4422',
    taskBkgColor: '#707070',
    taskBorderColor: '#575757',
    activeTaskBkgColor: { none: '#eeeeee', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    activeTaskBorderColor: '#575757',
    doneTaskBkgColor: '#bbbbbb',
    doneTaskBorderColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    critBkgColor: '#dd4422',
    critBorderColor: '#b1361b',
    taskTextColor: '#ffffff',
    taskTextOutsideColor: '#333333',
    taskTextDarkColor: '#333333',
  },
  base: {
    sectionBkgColor: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    altSectionBkgColor: '#ffffff',
    sectionBkgColor2: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    excludeBkgColor: '#eeeeee',
    gridColor: '#d3d3d3',
    todayLineColor: '#ff0000',
    vertLineColor: '#000080',
    taskBkgColor: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    taskBorderColor: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    activeTaskBkgColor: {
      none: '#ffffff',
      'primaryColor:light': '#fff6db',
      'primaryColor:dark': '#508ab9',
    },
    activeTaskBorderColor: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    doneTaskBkgColor: '#d3d3d3',
    doneTaskBorderColor: '#808080',
    critBkgColor: '#ff0000',
    critBorderColor: '#ff8888',
    taskTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    taskTextOutsideColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    taskTextDarkColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v13's darkMode switches only the derivation rules: base's task text keeps its ink where v12 turns it to #eee, and doneTaskBkgColor takes the dark rule (DESIGN §8.1 rule 4)":
    [
      ...keys('default', ['darkMode'], ['doneTaskBkgColor']),
      ...keys('forest', ['darkMode'], ['doneTaskBkgColor']),
      ...keys('neutral', ['darkMode'], ['doneTaskBkgColor']),
      ...keys(
        'base',
        ['darkMode'],
        ['doneTaskBkgColor', 'taskTextColor', 'taskTextOutsideColor', 'taskTextDarkColor']
      ),
    ],
  "D574: the classic family's active outline and vert marker take lineColor, for contrast, where v12's base keeps navy for the marker and the primary colour for the outline; base's lineColor derives from background":
    [
      ...keys(
        'base',
        ['background:light', 'background:dark', 'lineColor:light', 'lineColor:dark'],
        ['vertLineColor']
      ),
      ...keys(
        'base',
        [
          'primaryColor:light',
          'primaryColor:dark',
          'background:light',
          'background:dark',
          'lineColor:light',
          'lineColor:dark',
        ],
        ['activeTaskBorderColor']
      ),
    ],
  "D657: the task bars, the active bar and the third section band read mainBkg, so an author's mainBkg moves them where v12's constructor values stay; under dark, the text on the active bar follows its fill (D574's contrast rule)":
    [
      ...keys(
        'default',
        ['mainBkg:light', 'mainBkg:dark'],
        ['sectionBkgColor2', 'taskBkgColor', 'activeTaskBkgColor']
      ),
      ...keys(
        'dark',
        ['mainBkg:light', 'mainBkg:dark'],
        ['sectionBkgColor2', 'activeTaskBkgColor']
      ),
      ...keys('dark', ['mainBkg:light'], ['taskTextDarkColor']),
      ...keys('forest', ['mainBkg:light', 'mainBkg:dark'], ['sectionBkgColor2', 'taskBkgColor']),
      ...keys('neutral', ['mainBkg:light', 'mainBkg:dark'], ['sectionBkgColor2', 'taskBkgColor']),
      ...keys(
        'base',
        ['mainBkg:light', 'mainBkg:dark'],
        ['sectionBkgColor2', 'taskBkgColor', 'activeTaskBkgColor']
      ),
    ],
  "D667: v13 keeps its own response where following v12's would move a value with no override: neutral's done outline stays grey, dark's alternate band stays white, and dark's done bars follow mainBkg":
    [
      ...keys('neutral', ['lineColor:light', 'lineColor:dark'], ['doneTaskBorderColor']),
      ...keys('dark', ['background:light', 'background:dark'], ['altSectionBkgColor']),
      ...keys('dark', ['mainBkg:light', 'mainBkg:dark'], ['doneTaskBkgColor']),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys(
    'default',
    ['none'],
    [
      'sectionBkgColor',
      'sectionBkgColor2',
      'vertLineColor',
      'taskBkgColor',
      'taskBorderColor',
      'activeTaskBkgColor',
      'activeTaskBorderColor',
      'taskTextColor',
      'taskTextOutsideColor',
      'taskTextDarkColor',
    ]
  ),
  ...keys(
    'dark',
    ['none'],
    [
      'sectionBkgColor',
      'altSectionBkgColor',
      'sectionBkgColor2',
      'excludeBkgColor',
      'todayLineColor',
      'vertLineColor',
      'taskBkgColor',
      'taskBorderColor',
      'activeTaskBkgColor',
      'activeTaskBorderColor',
      'doneTaskBkgColor',
      'critBkgColor',
      'critBorderColor',
      'taskTextColor',
      'taskTextOutsideColor',
      'taskTextDarkColor',
    ]
  ),
  ...keys(
    'forest',
    ['none'],
    [
      'sectionBkgColor',
      'sectionBkgColor2',
      'vertLineColor',
      'taskBkgColor',
      'taskBorderColor',
      'activeTaskBkgColor',
      'activeTaskBorderColor',
      'taskTextColor',
    ]
  ),
  ...keys(
    'neutral',
    ['none'],
    [
      'sectionBkgColor',
      'sectionBkgColor2',
      'gridColor',
      'todayLineColor',
      'vertLineColor',
      'taskBkgColor',
      'taskBorderColor',
      'activeTaskBkgColor',
      'activeTaskBorderColor',
      'doneTaskBkgColor',
      'doneTaskBorderColor',
      'critBkgColor',
      'critBorderColor',
      'taskTextColor',
      'taskTextOutsideColor',
      'taskTextDarkColor',
    ]
  ),
  ...keys('base', ['none'], ['vertLineColor', 'taskBorderColor', 'activeTaskBorderColor']),
];

describe('gantt colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(gantt.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
