/**
 * #1037 (spec #1035 T0, D654): journey's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { journey } from '@mermaid-js/diagram-journey';
import { describe } from 'vitest';
import { describeDiagramOverrides, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's journey colours: `capture-theme-overrides.ts journey`. */
const V12: ReferenceTable = {
  default: {
    fillType0: { none: '#ececff', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    fillType1: {
      none: '#ffffde',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    fillType2: { none: '#ffecfe', 'primaryColor:light': '#82ff66', 'primaryColor:dark': '#4a2a69' },
    fillType3: {
      none: '#deffe0',
      'secondaryColor:light': '#82ff66',
      'secondaryColor:dark': '#4a2a69',
    },
    fillType4: { none: '#ecfffe', 'primaryColor:light': '#ff6696', 'primaryColor:dark': '#2a6942' },
    fillType5: {
      none: '#ffdee0',
      'secondaryColor:light': '#ff6696',
      'secondaryColor:dark': '#2a6942',
    },
    fillType6: { none: '#ffefec', 'primaryColor:light': '#66ffed', 'primaryColor:dark': '#692a45' },
    fillType7: {
      none: '#defbff',
      'secondaryColor:light': '#66ffed',
      'secondaryColor:dark': '#692a45',
    },
  },
  dark: {
    fillType0: { none: '#1f2020', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    fillType1: {
      none: '#474949',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    fillType2: { none: '#1f1f20', 'primaryColor:light': '#82ff66', 'primaryColor:dark': '#4a2a69' },
    fillType3: {
      none: '#474749',
      'secondaryColor:light': '#82ff66',
      'secondaryColor:dark': '#4a2a69',
    },
    fillType4: { none: '#1f201f', 'primaryColor:light': '#ff6696', 'primaryColor:dark': '#2a6942' },
    fillType5: {
      none: '#474947',
      'secondaryColor:light': '#ff6696',
      'secondaryColor:dark': '#2a6942',
    },
    fillType6: { none: '#201f20', 'primaryColor:light': '#66ffed', 'primaryColor:dark': '#692a45' },
    fillType7: {
      none: '#494749',
      'secondaryColor:light': '#66ffed',
      'secondaryColor:dark': '#692a45',
    },
  },
  forest: {
    fillType0: { none: '#cde498', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    fillType1: {
      none: '#cdffb2',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    fillType2: { none: '#98e4b4', 'primaryColor:light': '#82ff66', 'primaryColor:dark': '#4a2a69' },
    fillType3: {
      none: '#b2ffe9',
      'secondaryColor:light': '#82ff66',
      'secondaryColor:dark': '#4a2a69',
    },
    fillType4: { none: '#e4aa98', 'primaryColor:light': '#ff6696', 'primaryColor:dark': '#2a6942' },
    fillType5: {
      none: '#ffdfb2',
      'secondaryColor:light': '#ff6696',
      'secondaryColor:dark': '#2a6942',
    },
    fillType6: { none: '#98c3e4', 'primaryColor:light': '#66ffed', 'primaryColor:dark': '#692a45' },
    fillType7: {
      none: '#b2c3ff',
      'secondaryColor:light': '#66ffed',
      'secondaryColor:dark': '#692a45',
    },
  },
  neutral: {
    fillType0: { none: '#eeeeee', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    fillType1: {
      none: '#fcfcfc',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    fillType2: { none: '#eeeeee', 'primaryColor:light': '#82ff66', 'primaryColor:dark': '#4a2a69' },
    fillType3: {
      none: '#fcfcfc',
      'secondaryColor:light': '#82ff66',
      'secondaryColor:dark': '#4a2a69',
    },
    fillType4: { none: '#eeeeee', 'primaryColor:light': '#ff6696', 'primaryColor:dark': '#2a6942' },
    fillType5: {
      none: '#fcfcfc',
      'secondaryColor:light': '#ff6696',
      'secondaryColor:dark': '#2a6942',
    },
    fillType6: { none: '#eeeeee', 'primaryColor:light': '#66ffed', 'primaryColor:dark': '#692a45' },
    fillType7: {
      none: '#fcfcfc',
      'secondaryColor:light': '#66ffed',
      'secondaryColor:dark': '#692a45',
    },
  },
  base: {
    fillType0: { none: '#fff4dd', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    fillType1: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    fillType2: { none: '#e6ffdd', 'primaryColor:light': '#82ff66', 'primaryColor:dark': '#4a2a69' },
    fillType3: {
      none: '#ffdde6',
      'primaryColor:light': '#ff6682',
      'primaryColor:dark': '#2a694a',
      'secondaryColor:light': '#82ff66',
      'secondaryColor:dark': '#4a2a69',
    },
    fillType4: { none: '#ffddea', 'primaryColor:light': '#ff6696', 'primaryColor:dark': '#2a6942' },
    fillType5: {
      none: '#ddeaff',
      'primaryColor:light': '#6696ff',
      'primaryColor:dark': '#69422a',
      'secondaryColor:light': '#ff6696',
      'secondaryColor:dark': '#2a6942',
    },
    fillType6: { none: '#ddfff9', 'primaryColor:light': '#66ffed', 'primaryColor:dark': '#692a45' },
    fillType7: {
      none: '#fff9dd',
      'primaryColor:light': '#ffed66',
      'primaryColor:dark': '#2a4569',
      'secondaryColor:light': '#66ffed',
      'secondaryColor:dark': '#692a45',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('journey colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(journey.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
