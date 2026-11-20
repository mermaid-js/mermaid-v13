/**
 * #1037 (spec #1035 T0, D654): er's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { er } from '@mermaid-js/diagram-er';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's er colours: `capture-theme-overrides.ts er`. */
const V12: ReferenceTable = {
  default: {
    rowOdd: '#ffffff',
    rowEven: { none: '#f1f1ff', 'primaryColor:light': '#ffda6b', 'primaryColor:dark': '#2b506d' },
  },
  dark: {
    rowOdd: '#2c2d2d',
    rowEven: '#060606',
  },
  forest: {
    rowOdd: '#ffffff',
    rowEven: { none: '#f4f9e9', 'mainBkg:light': '#fff2cc', 'mainBkg:dark': '#4782b2' },
  },
  neutral: {
    rowOdd: '#ffffff',
    rowEven: '#f4f4f4',
  },
  base: {
    rowOdd: { none: '#ffffff', darkMode: '#ffecc3' },
    rowEven: {
      none: '#fffcf6',
      'primaryColor:light': '#ffdf80',
      'primaryColor:dark': '#315a7b',
      'mainBkg:light': '#ffdf80',
      'mainBkg:dark': '#315a7b',
      darkMode: '#ffe3aa',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v13's darkMode switches only the derivation rules, so rowOdd takes the dark rule, as DESIGN §8.1 rule 4 says":
    [...keys('forest', ['darkMode'], ['rowOdd']), ...keys('base', ['darkMode'], ['rowOdd'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('er colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(er.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
