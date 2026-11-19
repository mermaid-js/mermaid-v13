/**
 * #1037 (spec #1035 T0, D654): radar's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { radar } from '@mermaid-js/diagram-radar';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's radar colours: `capture-theme-overrides.ts radar`. */
const V12: ReferenceTable = {
  default: {
    radarAxisColor: '#333333',
    radarGraticuleColor: '#dedede',
  },
  dark: {
    radarAxisColor: '#d3d3d3',
    radarGraticuleColor: '#dedede',
  },
  forest: {
    radarAxisColor: { none: '#000000', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    radarGraticuleColor: '#dedede',
  },
  neutral: {
    radarAxisColor: { none: '#666666', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    radarGraticuleColor: '#dedede',
  },
  base: {
    radarAxisColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    radarGraticuleColor: '#dedede',
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D351: radarAxisColor follows an author's lineColor in every theme, on purpose; v12's default and dark keep their constructor value":
    [
      ...keys('default', ['lineColor:light', 'lineColor:dark'], ['radarAxisColor']),
      ...keys('dark', ['lineColor:light', 'lineColor:dark'], ['radarAxisColor']),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('radar colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(radar.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
