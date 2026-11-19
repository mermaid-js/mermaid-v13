/**
 * #1037 (spec #1035 T0, D654): requirement's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { requirement } from '@mermaid-js/diagram-requirement';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's requirement colours: `capture-theme-overrides.ts requirement`. */
const V12: ReferenceTable = {
  default: {
    requirementBackground: '#ececff',
    requirementBorderColor: '#c7c7f1',
    requirementTextColor: '#131300',
    relationLabelBackground: '#e8e8e8cc',
    relationColor: '#333333',
    relationLabelColor: '#000000',
  },
  dark: {
    requirementBackground: {
      none: '#1f2020',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    requirementBorderColor: '#cccccc',
    requirementTextColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    relationLabelBackground: {
      none: '#474949',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
      darkMode: '#000000',
    },
    relationColor: '#d3d3d3',
    relationLabelColor: '#d3d3d3',
  },
  forest: {
    requirementBackground: {
      none: '#cde498',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    requirementBorderColor: '#abb594',
    requirementTextColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    relationLabelBackground: '#e8e8e8',
    relationColor: { none: '#000000', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    relationLabelColor: '#000000',
  },
  neutral: {
    requirementBackground: {
      none: '#eeeeee',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    requirementBorderColor: '#d4d4d4',
    requirementTextColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    relationLabelBackground: '#ffffff',
    relationColor: { none: '#666666', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    relationLabelColor: '#333333',
  },
  base: {
    requirementBackground: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    requirementBorderColor: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    requirementTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    relationLabelBackground: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
      darkMode: '#c244ff',
    },
    relationColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    relationLabelColor: {
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
  "#1035 T3 (#1040): requirement's variables do not respond to an override as v12's do (D656); T3 deletes this group":
    [
      ...keys('default', ['mainBkg:light', 'mainBkg:dark'], ['requirementBackground']),
      ...keys('default', ['lineColor:light', 'lineColor:dark'], ['relationColor']),
      ...keys('default', ['background:light', 'background:dark'], ['relationLabelBackground']),
      ...keys(
        'dark',
        ['primaryColor:light', 'primaryColor:dark', 'mainBkg:light', 'mainBkg:dark'],
        ['requirementBackground']
      ),
      ...keys('dark', ['lineColor:light', 'lineColor:dark'], ['relationColor']),
      ...keys(
        'dark',
        ['primaryTextColor:light', 'primaryTextColor:dark'],
        ['requirementTextColor']
      ),
      ...keys(
        'dark',
        [
          'secondaryColor:light',
          'secondaryColor:dark',
          'background:light',
          'background:dark',
          'darkMode',
        ],
        ['relationLabelBackground']
      ),
      ...keys(
        'forest',
        ['primaryColor:light', 'primaryColor:dark', 'mainBkg:light', 'mainBkg:dark'],
        ['requirementBackground']
      ),
      ...keys(
        'forest',
        ['primaryTextColor:light', 'primaryTextColor:dark'],
        ['requirementTextColor']
      ),
      ...keys('forest', ['background:light', 'background:dark'], ['relationLabelBackground']),
      ...keys(
        'neutral',
        ['primaryColor:light', 'primaryColor:dark', 'mainBkg:light', 'mainBkg:dark'],
        ['requirementBackground']
      ),
      ...keys('neutral', ['background:light', 'background:dark'], ['relationLabelBackground']),
      ...keys(
        'neutral',
        ['primaryTextColor:light', 'primaryTextColor:dark'],
        ['requirementTextColor']
      ),
      ...keys('base', ['mainBkg:light', 'mainBkg:dark'], ['requirementBackground']),
      ...keys(
        'base',
        [
          'primaryColor:light',
          'primaryColor:dark',
          'secondaryColor:light',
          'secondaryColor:dark',
          'background:light',
          'background:dark',
          'darkMode',
        ],
        ['relationLabelBackground']
      ),
    ],
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['requirementTextColor', 'relationLabelColor'])],
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
      'requirementBorderColor',
      'requirementTextColor',
      'relationLabelBackground',
      'relationLabelColor',
    ]
  ),
  ...keys(
    'dark',
    ['none'],
    ['requirementTextColor', 'relationLabelBackground', 'relationLabelColor']
  ),
  ...keys(
    'forest',
    ['none'],
    ['requirementBorderColor', 'requirementTextColor', 'relationLabelBackground']
  ),
  ...keys(
    'neutral',
    ['none'],
    ['requirementBorderColor', 'requirementTextColor', 'relationLabelColor']
  ),
  ...keys('base', ['none'], ['requirementBorderColor', 'relationLabelBackground']),
];

describe('requirement colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(requirement.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
