/**
 * #1037 (spec #1035 T0, D654): treemap's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { treemap } from '@mermaid-js/diagram-treemap';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's treemap colours: `capture-theme-overrides.ts treemap`. */
const V12: ReferenceTable = {
  default: {
    cScalePeer0: '#3939ff',
    cScalePeer1: '#f7f700',
    cScalePeer2: '#b5ff20',
    cScalePeer3: '#9c39ff',
    cScalePeer4: '#ff39ff',
    cScalePeer5: '#ff399c',
    cScalePeer6: '#ff3939',
    cScalePeer7: '#ff9c39',
    cScalePeer8: '#9cff39',
    cScalePeer9: '#39ff9c',
    cScalePeer10: '#39ffff',
    cScalePeer11: '#399cff',
  },
  dark: {
    cScalePeer0: {
      none: '#383a3a',
      'primaryColor:light': '#ffe699',
      'primaryColor:dark': '#39688d',
    },
    cScalePeer1: '#3e0000',
    cScalePeer2: '#771955',
    cScalePeer3: '#546e76',
    cScalePeer4: '#754628',
    cScalePeer5: '#9d0e0e',
    cScalePeer6: '#65007b',
    cScalePeer7: '#cc7801',
    cScalePeer8: '#23760a',
    cScalePeer9: '#2a2c41',
    cScalePeer10: '#003ca2',
    cScalePeer11: '#0182cf',
  },
  forest: {
    cScalePeer0: {
      none: '#7ca02a',
      'primaryColor:light': '#b38600',
      'primaryColor:dark': '#000000',
    },
    cScalePeer1: {
      none: '#47cb00',
      'secondaryColor:light': '#806000',
      'secondaryColor:dark': '#000000',
    },
    cScalePeer2: {
      none: '#8cb42f',
      'tertiaryColor:light': '#997300',
      'tertiaryColor:dark': '#000000',
    },
    cScalePeer3: {
      none: '#41a02a',
      'primaryColor:light': '#86b300',
      'primaryColor:dark': '#000000',
    },
    cScalePeer4: {
      none: '#2aa04d',
      'primaryColor:light': '#2cb300',
      'primaryColor:dark': '#000000',
    },
    cScalePeer5: {
      none: '#2aa088',
      'primaryColor:light': '#00b32d',
      'primaryColor:dark': '#000000',
    },
    cScalePeer6: {
      none: '#2a7ca0',
      'primaryColor:light': '#00b386',
      'primaryColor:dark': '#000000',
    },
    cScalePeer7: {
      none: '#2a41a0',
      'primaryColor:light': '#0086b3',
      'primaryColor:dark': '#000000',
    },
    cScalePeer8: {
      none: '#882aa0',
      'primaryColor:light': '#2d00b3',
      'primaryColor:dark': '#000000',
    },
    cScalePeer9: {
      none: '#a02a41',
      'primaryColor:light': '#b30086',
      'primaryColor:dark': '#000000',
    },
    cScalePeer10: {
      none: '#a04d2a',
      'primaryColor:light': '#b3002c',
      'primaryColor:dark': '#000000',
    },
    cScalePeer11: {
      none: '#a0882a',
      'primaryColor:light': '#b32d00',
      'primaryColor:dark': '#000000',
    },
  },
  neutral: {
    cScalePeer0: { none: '#3b3b3b', darkMode: '#6e6e6e' },
    cScalePeer1: { none: '#dadada', darkMode: '#ffffff' },
    cScalePeer2: { none: '#3b3b3b', darkMode: '#6e6e6e' },
    cScalePeer3: { none: '#a1a1a1', darkMode: '#d4d4d4' },
    cScalePeer4: { none: '#5e5e5e', darkMode: '#919191' },
    cScalePeer5: { none: '#808080', darkMode: '#b3b3b3' },
    cScalePeer6: { none: '#c4c4c4', darkMode: '#f7f7f7' },
    cScalePeer7: { none: '#e6e6e6', darkMode: '#ffffff' },
    cScalePeer8: { none: '#c4c4c4', darkMode: '#f7f7f7' },
    cScalePeer9: { none: '#a1a1a1', darkMode: '#d4d4d4' },
    cScalePeer10: { none: '#808080', darkMode: '#b3b3b3' },
    cScalePeer11: { none: '#5e5e5e', darkMode: '#919191' },
  },
  base: {
    cScalePeer0: {
      none: '#ffba2a',
      'primaryColor:light': '#b38600',
      'primaryColor:dark': '#000000',
      darkMode: '#906200',
    },
    cScalePeer1: {
      none: '#ba2aff',
      'primaryColor:light': '#8600b3',
      'primaryColor:dark': '#000000',
      'secondaryColor:light': '#b38600',
      'secondaryColor:dark': '#000000',
      darkMode: '#620090',
    },
    cScalePeer2: {
      none: '#4480ff',
      'primaryColor:light': '#0033cc',
      'primaryColor:dark': '#000000',
      'tertiaryColor:light': '#b38600',
      'tertiaryColor:dark': '#000000',
      darkMode: '#0037aa',
    },
    cScalePeer3: {
      none: '#daff2a',
      'primaryColor:light': '#86b300',
      'primaryColor:dark': '#000000',
      darkMode: '#779000',
    },
    cScalePeer4: {
      none: '#6fff2a',
      'primaryColor:light': '#2cb300',
      'primaryColor:dark': '#000000',
      darkMode: '#2f9000',
    },
    cScalePeer5: {
      none: '#2aff50',
      'primaryColor:light': '#00b32d',
      'primaryColor:dark': '#000000',
      darkMode: '#009019',
    },
    cScalePeer6: {
      none: '#2affba',
      'primaryColor:light': '#00b386',
      'primaryColor:dark': '#000000',
      darkMode: '#009062',
    },
    cScalePeer7: {
      none: '#2adaff',
      'primaryColor:light': '#0086b3',
      'primaryColor:dark': '#000000',
      darkMode: '#007790',
    },
    cScalePeer8: {
      none: '#6c4dff',
      'primaryColor:light': '#794dff',
      'primaryColor:dark': '#ccc880',
      darkMode: '#1f00b3',
    },
    cScalePeer9: {
      none: '#ff2ada',
      'primaryColor:light': '#b30086',
      'primaryColor:dark': '#000000',
      darkMode: '#900077',
    },
    cScalePeer10: {
      none: '#ff2a6f',
      'primaryColor:light': '#b3002c',
      'primaryColor:dark': '#000000',
      darkMode: '#90002f',
    },
    cScalePeer11: {
      none: '#ff502a',
      'primaryColor:light': '#b32d00',
      'primaryColor:dark': '#000000',
      darkMode: '#901900',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "#1035 T2 (#1039): treemap's variables do not respond to an override as v12's do (D656); T2 deletes this group":
    [
      ...keys(
        'default',
        ['darkMode'],
        [
          'cScalePeer0',
          'cScalePeer1',
          'cScalePeer2',
          'cScalePeer3',
          'cScalePeer4',
          'cScalePeer5',
          'cScalePeer6',
          'cScalePeer7',
          'cScalePeer8',
          'cScalePeer9',
          'cScalePeer10',
          'cScalePeer11',
        ]
      ),
      ...keys(
        'forest',
        ['darkMode'],
        [
          'cScalePeer0',
          'cScalePeer1',
          'cScalePeer2',
          'cScalePeer3',
          'cScalePeer4',
          'cScalePeer5',
          'cScalePeer6',
          'cScalePeer7',
          'cScalePeer8',
          'cScalePeer9',
          'cScalePeer10',
          'cScalePeer11',
        ]
      ),
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
      'cScalePeer0',
      'cScalePeer1',
      'cScalePeer2',
      'cScalePeer3',
      'cScalePeer4',
      'cScalePeer5',
      'cScalePeer6',
      'cScalePeer7',
      'cScalePeer8',
      'cScalePeer9',
      'cScalePeer10',
      'cScalePeer11',
    ]
  ),
  ...keys(
    'forest',
    ['none'],
    [
      'cScalePeer0',
      'cScalePeer1',
      'cScalePeer2',
      'cScalePeer3',
      'cScalePeer4',
      'cScalePeer5',
      'cScalePeer6',
      'cScalePeer7',
      'cScalePeer8',
      'cScalePeer9',
      'cScalePeer10',
      'cScalePeer11',
    ]
  ),
];

describe('treemap colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(treemap.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
