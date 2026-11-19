/**
 * #1037 (spec #1035 T0, D654): xychart's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { xychart } from '@mermaid-js/diagram-xychart';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's xychart colours: `capture-theme-overrides.ts xychart`. */
const V12: ReferenceTable = {
  default: {
    xyChartBackgroundColor: '#ffffff',
    xyChartTitleColor: '#131300',
    xyChartDataLabelColor: '#131300',
    xyChartLegendTextColor: '#131300',
    xyChartXAxisTitleColor: '#131300',
    xyChartXAxisLabelColor: '#131300',
    xyChartXAxisTickColor: '#131300',
    xyChartXAxisLineColor: '#131300',
    xyChartYAxisTitleColor: '#131300',
    xyChartYAxisLabelColor: '#131300',
    xyChartYAxisTickColor: '#131300',
    xyChartYAxisLineColor: '#131300',
  },
  dark: {
    xyChartBackgroundColor: {
      none: '#333333',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    xyChartTitleColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartDataLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartLegendTextColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTitleColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTickColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLineColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTitleColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTickColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLineColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  forest: {
    xyChartBackgroundColor: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    xyChartTitleColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartDataLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartLegendTextColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTitleColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTickColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLineColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTitleColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTickColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLineColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  neutral: {
    xyChartBackgroundColor: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    xyChartTitleColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartDataLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartLegendTextColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTitleColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisTickColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartXAxisLineColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTitleColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisTickColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    xyChartYAxisLineColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  base: {
    xyChartBackgroundColor: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    xyChartTitleColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartDataLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartLegendTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartXAxisTitleColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartXAxisLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartXAxisTickColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartXAxisLineColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartYAxisTitleColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartYAxisLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartYAxisTickColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    xyChartYAxisLineColor: {
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
    [
      ...keys(
        'base',
        ['darkMode'],
        [
          'xyChartTitleColor',
          'xyChartDataLabelColor',
          'xyChartLegendTextColor',
          'xyChartXAxisTitleColor',
          'xyChartXAxisLabelColor',
          'xyChartXAxisTickColor',
          'xyChartXAxisLineColor',
          'xyChartYAxisTitleColor',
          'xyChartYAxisLabelColor',
          'xyChartYAxisTickColor',
          'xyChartYAxisLineColor',
        ]
      ),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('xychart colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(xychart.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
