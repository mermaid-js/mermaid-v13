/**
 * #1037 (spec #1035 T0, D654): gitgraph's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { gitGraph } from '@mermaid-js/diagram-gitgraph';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's gitgraph colours: `capture-theme-overrides.ts gitgraph`. */
const V12: ReferenceTable = {
  default: {
    commitLabelColor: '#000021',
    commitLabelBackground: '#ffffde',
    tagLabelColor: '#131300',
    tagLabelBackground: '#ececff',
    tagLabelBorder: '#c7c7f1',
  },
  dark: {
    commitLabelColor: '#b8b6b6',
    commitLabelBackground: {
      none: '#474949',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tagLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    tagLabelBackground: {
      none: '#1f2020',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    tagLabelBorder: '#cccccc',
  },
  forest: {
    commitLabelColor: '#32004d',
    commitLabelBackground: {
      none: '#cdffb2',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tagLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    tagLabelBackground: {
      none: '#cde498',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    tagLabelBorder: '#abb594',
  },
  neutral: {
    commitLabelColor: '#030303',
    commitLabelBackground: {
      none: '#fcfcfc',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tagLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    tagLabelBackground: {
      none: '#eeeeee',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    tagLabelBorder: '#d4d4d4',
  },
  base: {
    commitLabelColor: {
      none: '#0b2200',
      'primaryColor:light': '#269900',
      'primaryColor:dark': '#b296d5',
      'secondaryColor:light': '#002699',
      'secondaryColor:dark': '#d5b296',
    },
    commitLabelBackground: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    tagLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    tagLabelBackground: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
    },
    tagLabelBorder: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['tagLabelColor'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [...keys('base', ['none'], ['tagLabelBorder'])];

describe('gitgraph colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(gitGraph.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
