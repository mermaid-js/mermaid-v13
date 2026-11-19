/**
 * #1037 (spec #1035 T0, D654): venn's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { venn } from '@mermaid-js/diagram-venn';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's venn colours: `capture-theme-overrides.ts venn`. */
const V12: ReferenceTable = {
  default: {
    venn1: '#5353ff',
    venn2: '#ffff45',
    venn3: '#b5ff20',
    venn4: '#ff53ff',
    venn5: '#53ffff',
    venn6: '#45ff45',
    venn7: '#ff5353',
    venn8: '#45ffff',
    vennTitleTextColor: '#333333',
    vennSetTextColor: '#333333',
  },
  dark: {
    venn1: { none: '#6a6e6e', 'primaryColor:light': '#ffffff', 'primaryColor:dark': '#699bc3' },
    venn2: '#a40000',
    venn3: '#cc2a91',
    venn4: '#87a1a9',
    venn5: '#bf7344',
    venn6: '#eb2626',
    venn7: '#b800e1',
    venn8: '#feab35',
    vennTitleTextColor: '#f9fffe',
    vennSetTextColor: '#cccccc',
  },
  forest: {
    venn1: { none: '#8cb42f', 'primaryColor:light': '#cc9900', 'primaryColor:dark': '#000000' },
    venn2: { none: '#6aff19', 'secondaryColor:light': '#cc9900', 'secondaryColor:dark': '#000000' },
    venn3: { none: '#a6cf47', 'tertiaryColor:light': '#cc9900', 'tertiaryColor:dark': '#000000' },
    venn4: { none: '#2fb457', 'primaryColor:light': '#33cc00', 'primaryColor:dark': '#000000' },
    venn5: { none: '#b4572f', 'primaryColor:light': '#cc0033', 'primaryColor:dark': '#000000' },
    venn6: { none: '#19ffae', 'secondaryColor:light': '#33cc00', 'secondaryColor:dark': '#000000' },
    venn7: { none: '#2f8cb4', 'primaryColor:light': '#00cc99', 'primaryColor:dark': '#000000' },
    venn8: { none: '#196aff', 'secondaryColor:light': '#00cc99', 'secondaryColor:dark': '#000000' },
    vennTitleTextColor: '#333333',
    vennSetTextColor: '#000000',
  },
  neutral: {
    venn1: '#555555',
    venn2: '#f4f4f4',
    venn3: '#555555',
    venn4: '#bbbbbb',
    venn5: '#777777',
    venn6: '#999999',
    venn7: '#dddddd',
    venn8: '#ffffff',
    vennTitleTextColor: '#333333',
    vennSetTextColor: '#000000',
  },
  base: {
    venn1: { none: '#ffc244', 'primaryColor:light': '#cc9900', 'primaryColor:dark': '#000000' },
    venn2: {
      none: '#c244ff',
      'primaryColor:light': '#9900cc',
      'primaryColor:dark': '#000000',
      'secondaryColor:light': '#cc9900',
      'secondaryColor:dark': '#000000',
    },
    venn3: {
      none: '#5d92ff',
      'primaryColor:light': '#0039e6',
      'primaryColor:dark': '#0e0906',
      'tertiaryColor:light': '#cc9900',
      'tertiaryColor:dark': '#000000',
    },
    venn4: { none: '#80ff44', 'primaryColor:light': '#33cc00', 'primaryColor:dark': '#000000' },
    venn5: { none: '#ff4480', 'primaryColor:light': '#cc0033', 'primaryColor:dark': '#000000' },
    venn6: {
      none: '#ff4480',
      'primaryColor:light': '#cc0033',
      'primaryColor:dark': '#000000',
      'secondaryColor:light': '#33cc00',
      'secondaryColor:dark': '#000000',
    },
    venn7: { none: '#44ffc2', 'primaryColor:light': '#00cc99', 'primaryColor:dark': '#000000' },
    venn8: {
      none: '#ffc244',
      'primaryColor:light': '#cc9900',
      'primaryColor:dark': '#000000',
      'secondaryColor:light': '#00cc99',
      'secondaryColor:dark': '#000000',
    },
    vennTitleTextColor: {
      none: '#090600',
      'primaryColor:light': '#806000',
      'primaryColor:dark': '#84adce',
      'tertiaryColor:light': '#002699',
      'tertiaryColor:dark': '#d5b296',
    },
    vennSetTextColor: {
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
  "D415: neutral takes default's slot formula on its own colours (a D541 family-rule approximation), so its slots follow the base colours, where v12's cScale greys stay":
    [
      ...keys(
        'neutral',
        ['primaryColor:light', 'primaryColor:dark'],
        ['venn1', 'venn4', 'venn5', 'venn7']
      ),
      ...keys(
        'neutral',
        ['secondaryColor:light', 'secondaryColor:dark'],
        ['venn2', 'venn6', 'venn8']
      ),
      ...keys('neutral', ['tertiaryColor:light', 'tertiaryColor:dark'], ['venn3']),
    ],
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['vennSetTextColor'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys('default', ['none'], ['venn3']),
  ...keys('forest', ['none'], ['venn3']),
  ...keys(
    'neutral',
    ['none'],
    ['venn1', 'venn2', 'venn3', 'venn4', 'venn5', 'venn6', 'venn7', 'venn8']
  ),
  ...keys('base', ['none'], ['venn3']),
];

describe('venn colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(venn.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
