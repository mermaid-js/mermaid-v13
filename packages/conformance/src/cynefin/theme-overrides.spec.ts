/**
 * #1037 (spec #1035 T0, D654): cynefin's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { cynefin } from '@mermaid-js/diagram-cynefin';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's cynefin colours: `capture-theme-overrides.ts cynefin`. */
const V12: ReferenceTable = {
  default: {
    cynefinComplexBg: '#e8f5e9',
    cynefinComplicatedBg: '#e3f2fd',
    cynefinChaoticBg: '#fbe9e7',
    cynefinClearBg: '#fff8e1',
    cynefinConfusionBg: '#f3e5f5',
    cynefinBoundaryColor: '#333333',
    cynefinCliffColor: '#8b0000',
    cynefinArrowColor: '#333333',
    cynefinTextColor: '#333333',
    cynefinLabelColor: '#131300',
  },
  dark: {
    cynefinComplexBg: '#1b5e20',
    cynefinComplicatedBg: '#0d47a1',
    cynefinChaoticBg: '#bf360c',
    cynefinClearBg: '#f57f17',
    cynefinConfusionBg: '#4a148c',
    cynefinBoundaryColor: '#d3d3d3',
    cynefinCliffColor: '#ff6b6b',
    cynefinArrowColor: '#d3d3d3',
    cynefinTextColor: '#cccccc',
    cynefinLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  forest: {
    cynefinComplexBg: '#c8e6c9',
    cynefinComplicatedBg: '#dcedc8',
    cynefinChaoticBg: '#ffe0b2',
    cynefinClearBg: '#fff9c4',
    cynefinConfusionBg: '#d7ccc8',
    cynefinBoundaryColor: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinCliffColor: '#8b4513',
    cynefinArrowColor: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinTextColor: '#000000',
    cynefinLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  neutral: {
    cynefinComplexBg: '#e8f5e9',
    cynefinComplicatedBg: '#e3f2fd',
    cynefinChaoticBg: '#fbe9e7',
    cynefinClearBg: '#fff8e1',
    cynefinConfusionBg: '#f3e5f5',
    cynefinBoundaryColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinCliffColor: '#8b0000',
    cynefinArrowColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinTextColor: '#000000',
    cynefinLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  base: {
    cynefinComplexBg: '#e8f5e9',
    cynefinComplicatedBg: '#e3f2fd',
    cynefinChaoticBg: '#fbe9e7',
    cynefinClearBg: '#fff8e1',
    cynefinConfusionBg: '#f3e5f5',
    cynefinBoundaryColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinCliffColor: '#8b0000',
    cynefinArrowColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    cynefinTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    cynefinLabelColor: {
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
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['cynefinTextColor', 'cynefinLabelColor'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys(
    'forest',
    ['none'],
    [
      'cynefinComplexBg',
      'cynefinComplicatedBg',
      'cynefinChaoticBg',
      'cynefinClearBg',
      'cynefinConfusionBg',
      'cynefinCliffColor',
    ]
  ),
];

describe('cynefin colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(cynefin.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
