/**
 * #1037 (spec #1035 T0, D654): pie's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { pie } from '@mermaid-js/diagram-pie';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's pie colours: `capture-theme-overrides.ts pie`. */
const V12: ReferenceTable = {
  default: {
    pie1: '#ececff',
    pie2: '#ffffde',
    pie3: '#b5ff20',
    pie4: '#b9b9ff',
    pie5: '#ffff45',
    pie6: '#d7ff86',
    pie7: '#ff86ff',
    pie8: '#20ffff',
    pie9: '#ff2020',
    pie10: '#ff20ff',
    pie11: '#20ff8f',
    pie12: '#ff5353',
    pieTitleTextColor: '#000000',
    pieSectionTextColor: '#333333',
    pieLegendTextColor: '#000000',
    pieStrokeColor: '#000000',
    pieOuterStrokeColor: '#000000',
  },
  dark: {
    pie1: '#0b0000',
    pie2: '#4d1037',
    pie3: '#3f5258',
    pie4: '#4f2f1b',
    pie5: '#6e0a0a',
    pie6: '#3b0048',
    pie7: '#995a01',
    pie8: '#154706',
    pie9: '#161722',
    pie10: '#00296f',
    pie11: '#01629c',
    pieTitleTextColor: '#d3d3d3',
    pieSectionTextColor: '#cccccc',
    pieLegendTextColor: '#d3d3d3',
    pieStrokeColor: '#000000',
    pieOuterStrokeColor: '#000000',
  },
  forest: {
    pie1: { none: '#cde498', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    pie2: { none: '#cdffb2', 'secondaryColor:light': '#ffd966', 'secondaryColor:dark': '#2a4d69' },
    pie3: { none: '#e1efc0', 'tertiaryColor:light': '#ffd966', 'tertiaryColor:dark': '#2a4d69' },
    pie4: { none: '#8cb42f', 'primaryColor:light': '#cc9900', 'primaryColor:dark': '#000000' },
    pie5: { none: '#6aff19', 'secondaryColor:light': '#cc9900', 'secondaryColor:dark': '#000000' },
    pie6: { none: '#33b42f', 'tertiaryColor:light': '#599900', 'tertiaryColor:dark': '#000000' },
    pie7: { none: '#70d990', 'primaryColor:light': '#66ff33', 'primaryColor:dark': '#2e1b45' },
    pie8: { none: '#d99070', 'primaryColor:light': '#ff3366', 'primaryColor:dark': '#1b452e' },
    pie9: { none: '#98cde4', 'primaryColor:light': '#66ffd9', 'primaryColor:dark': '#692a4d' },
    pie10: { none: '#1a6330', 'primaryColor:light': '#196600', 'primaryColor:dark': '#000000' },
    pie11: { none: '#63301a', 'primaryColor:light': '#660019', 'primaryColor:dark': '#000000' },
    pie12: { none: '#1a4d63', 'primaryColor:light': '#00664d', 'primaryColor:dark': '#000000' },
    pieTitleTextColor: '#000000',
    pieSectionTextColor: '#000000',
    pieLegendTextColor: '#000000',
    pieStrokeColor: '#000000',
    pieOuterStrokeColor: '#000000',
  },
  neutral: {
    pie1: '#f4f4f4',
    pie2: '#555555',
    pie3: '#bbbbbb',
    pie4: '#777777',
    pie5: '#999999',
    pie6: '#dddddd',
    pie7: '#ffffff',
    pie8: '#dddddd',
    pie9: '#bbbbbb',
    pie10: '#999999',
    pie11: '#777777',
    pie12: '#555555',
    pieTitleTextColor: '#333333',
    pieSectionTextColor: '#000000',
    pieLegendTextColor: '#333333',
    pieStrokeColor: '#000000',
    pieOuterStrokeColor: '#000000',
  },
  base: {
    pie1: { none: '#fff4dd', 'primaryColor:light': '#ffd966', 'primaryColor:dark': '#2a4d69' },
    pie2: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    pie3: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    pie4: { none: '#ffe3aa', 'primaryColor:light': '#ffcc33', 'primaryColor:dark': '#1b3245' },
    pie5: {
      none: '#e3aaff',
      'primaryColor:light': '#cc33ff',
      'primaryColor:dark': '#32451b',
      'secondaryColor:light': '#ffcc33',
      'secondaryColor:dark': '#1b3245',
    },
    pie6: {
      none: '#c3d7ff',
      'primaryColor:light': '#4d79ff',
      'primaryColor:dark': '#573a23',
      'tertiaryColor:light': '#ffcc33',
      'tertiaryColor:dark': '#1b3245',
    },
    pie7: { none: '#c5ffaa', 'primaryColor:light': '#66ff33', 'primaryColor:dark': '#2e1b45' },
    pie8: { none: '#ffaac5', 'primaryColor:light': '#ff3366', 'primaryColor:dark': '#1b452e' },
    pie9: { none: '#ddfff4', 'primaryColor:light': '#66ffd9', 'primaryColor:dark': '#692a4d' },
    pie10: { none: '#a3ff77', 'primaryColor:light': '#3fff00', 'primaryColor:dark': '#150d20' },
    pie11: { none: '#ff77a3', 'primaryColor:light': '#ff003f', 'primaryColor:dark': '#0d2015' },
    pie12: { none: '#aaffe3', 'primaryColor:light': '#33ffcc', 'primaryColor:dark': '#451b32' },
    pieTitleTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    pieSectionTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    pieLegendTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    pieStrokeColor: '#000000',
    pieOuterStrokeColor: '#000000',
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        ['pieTitleTextColor', 'pieSectionTextColor', 'pieLegendTextColor']
      ),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys('default', ['none'], ['pie3', 'pie6']),
  ...keys('forest', ['none'], ['pie6']),
];

describe('pie colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(pie.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
