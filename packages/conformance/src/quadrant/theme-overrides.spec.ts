/**
 * #1037 (spec #1035 T0, D654): quadrant's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { quadrant } from '@mermaid-js/diagram-quadrant';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's quadrant colours: `capture-theme-overrides.ts quadrant`. */
const V12: ReferenceTable = {
  default: {
    quadrant1Fill: '#ececff',
    quadrant2Fill: '#f1f1ff',
    quadrant3Fill: '#f6f6ff',
    quadrant4Fill: '#fbfbff',
    quadrant1TextFill: '#131300',
    quadrant2TextFill: '#0e0e00',
    quadrant3TextFill: '#090900',
    quadrant4TextFill: '#040400',
    quadrantPointTextFill: '#131300',
    quadrantXAxisTextFill: '#131300',
    quadrantYAxisTextFill: '#131300',
    quadrantInternalBorderStrokeFill: '#c7c7f1',
    quadrantExternalBorderStrokeFill: '#c7c7f1',
    quadrantTitleFill: '#131300',
  },
  dark: {
    quadrant1Fill: {
      none: '#1f2020',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    quadrant2Fill: {
      none: '#242525',
      'primaryColor:light': '#ffde6b',
      'primaryColor:dark': '#2f526e',
    },
    quadrant3Fill: {
      none: '#292a2a',
      'primaryColor:light': '#ffe370',
      'primaryColor:dark': '#345773',
    },
    quadrant4Fill: {
      none: '#2e2f2f',
      'primaryColor:light': '#ffe875',
      'primaryColor:dark': '#395c78',
    },
    quadrant1TextFill: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrant2TextFill: {
      none: '#dbdada',
      'primaryTextColor:light': '#fad461',
      'primaryTextColor:dark': '#254864',
    },
    quadrant3TextFill: {
      none: '#d6d5d5',
      'primaryTextColor:light': '#f5cf5c',
      'primaryTextColor:dark': '#20435f',
    },
    quadrant4TextFill: {
      none: '#d1d0d0',
      'primaryTextColor:light': '#f0ca57',
      'primaryTextColor:dark': '#1b3e5a',
    },
    quadrantPointTextFill: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantXAxisTextFill: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantYAxisTextFill: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantInternalBorderStrokeFill: '#cccccc',
    quadrantExternalBorderStrokeFill: '#cccccc',
    quadrantTitleFill: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  forest: {
    quadrant1Fill: {
      none: '#cde498',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    quadrant2Fill: {
      none: '#d2e99d',
      'primaryColor:light': '#ffde6b',
      'primaryColor:dark': '#2f526e',
    },
    quadrant3Fill: {
      none: '#d7eea2',
      'primaryColor:light': '#ffe370',
      'primaryColor:dark': '#345773',
    },
    quadrant4Fill: {
      none: '#dcf3a7',
      'primaryColor:light': '#ffe875',
      'primaryColor:dark': '#395c78',
    },
    quadrant1TextFill: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrant2TextFill: {
      none: '#2d1662',
      'primaryTextColor:light': '#fad461',
      'primaryTextColor:dark': '#254864',
    },
    quadrant3TextFill: {
      none: '#28115d',
      'primaryTextColor:light': '#f5cf5c',
      'primaryTextColor:dark': '#20435f',
    },
    quadrant4TextFill: {
      none: '#230c58',
      'primaryTextColor:light': '#f0ca57',
      'primaryTextColor:dark': '#1b3e5a',
    },
    quadrantPointTextFill: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantXAxisTextFill: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantYAxisTextFill: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantInternalBorderStrokeFill: '#abb594',
    quadrantExternalBorderStrokeFill: '#abb594',
    quadrantTitleFill: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  neutral: {
    quadrant1Fill: {
      none: '#eeeeee',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    quadrant2Fill: {
      none: '#f3f3f3',
      'primaryColor:light': '#ffde6b',
      'primaryColor:dark': '#2f526e',
    },
    quadrant3Fill: {
      none: '#f8f8f8',
      'primaryColor:light': '#ffe370',
      'primaryColor:dark': '#345773',
    },
    quadrant4Fill: {
      none: '#fdfdfd',
      'primaryColor:light': '#ffe875',
      'primaryColor:dark': '#395c78',
    },
    quadrant1TextFill: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrant2TextFill: {
      none: '#0c0c0c',
      'primaryTextColor:light': '#fad461',
      'primaryTextColor:dark': '#254864',
    },
    quadrant3TextFill: {
      none: '#070707',
      'primaryTextColor:light': '#f5cf5c',
      'primaryTextColor:dark': '#20435f',
    },
    quadrant4TextFill: {
      none: '#020202',
      'primaryTextColor:light': '#f0ca57',
      'primaryTextColor:dark': '#1b3e5a',
    },
    quadrantPointTextFill: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantXAxisTextFill: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantYAxisTextFill: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    quadrantInternalBorderStrokeFill: '#d4d4d4',
    quadrantExternalBorderStrokeFill: '#d4d4d4',
    quadrantTitleFill: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  base: {
    quadrant1Fill: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    quadrant2Fill: {
      none: '#fff9e2',
      'primaryColor:light': '#ffde6b',
      'primaryColor:dark': '#2f526e',
    },
    quadrant3Fill: {
      none: '#fffee7',
      'primaryColor:light': '#ffe370',
      'primaryColor:dark': '#345773',
    },
    quadrant4Fill: {
      none: '#ffffec',
      'primaryColor:light': '#ffe875',
      'primaryColor:dark': '#395c78',
    },
    quadrant1TextFill: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    quadrant2TextFill: {
      none: '#2e2e2e',
      'primaryTextColor:light': '#fad461',
      'primaryTextColor:dark': '#254864',
      darkMode: '#e9e9e9',
    },
    quadrant3TextFill: {
      none: '#292929',
      'primaryTextColor:light': '#f5cf5c',
      'primaryTextColor:dark': '#20435f',
      darkMode: '#e4e4e4',
    },
    quadrant4TextFill: {
      none: '#242424',
      'primaryTextColor:light': '#f0ca57',
      'primaryTextColor:dark': '#1b3e5a',
      darkMode: '#dfdfdf',
    },
    quadrantPointTextFill: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    quadrantXAxisTextFill: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    quadrantYAxisTextFill: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    quadrantInternalBorderStrokeFill: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    quadrantExternalBorderStrokeFill: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    quadrantTitleFill: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "#1035 T2 (#1039): quadrant's variables do not respond to an override as v12's do (D656); T2 deletes this group":
    [
      ...keys(
        'default',
        ['primaryColor:light', 'primaryColor:dark'],
        ['quadrant1Fill', 'quadrant2Fill', 'quadrant3Fill', 'quadrant4Fill']
      ),
      ...keys(
        'default',
        ['primaryTextColor:light', 'primaryTextColor:dark'],
        [
          'quadrant1TextFill',
          'quadrant2TextFill',
          'quadrant3TextFill',
          'quadrant4TextFill',
          'quadrantPointTextFill',
          'quadrantXAxisTextFill',
          'quadrantYAxisTextFill',
          'quadrantTitleFill',
        ]
      ),
    ],
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        [
          'quadrant1TextFill',
          'quadrant2TextFill',
          'quadrant3TextFill',
          'quadrant4TextFill',
          'quadrantPointTextFill',
          'quadrantXAxisTextFill',
          'quadrantYAxisTextFill',
          'quadrantTitleFill',
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
    'base',
    ['none'],
    ['quadrantInternalBorderStrokeFill', 'quadrantExternalBorderStrokeFill']
  ),
];

describe('quadrant colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(quadrant.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
