/**
 * #1037 (spec #1035 T0, D654): architecture's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { architecture } from '@mermaid-js/diagram-architecture';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's architecture colours: `capture-theme-overrides.ts architecture`. */
const V12: ReferenceTable = {
  default: {
    archEdgeColor: { none: '#333333', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    archEdgeArrowColor: {
      none: '#333333',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    archGroupBorderColor: '#c7c7f1',
  },
  dark: {
    archEdgeColor: '#d3d3d3',
    archEdgeArrowColor: '#d3d3d3',
    archGroupBorderColor: '#cccccc',
  },
  forest: {
    archEdgeColor: { none: '#000000', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    archEdgeArrowColor: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    archGroupBorderColor: '#abb594',
  },
  neutral: {
    archEdgeColor: { none: '#666666', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
    archEdgeArrowColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    archGroupBorderColor: '#d4d4d4',
  },
  base: {
    archEdgeColor: '#777777',
    archEdgeArrowColor: '#777777',
    archGroupBorderColor: '#000000',
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D541: v12's base pins the edges at #777777 and the group border at #000000, which no trait separates from default; base takes the rule, so they follow the overrides its lineColor and calloutBorder follow":
    [
      ...keys(
        'base',
        ['background:light', 'background:dark', 'lineColor:light', 'lineColor:dark'],
        ['archEdgeColor', 'archEdgeArrowColor']
      ),
      ...keys(
        'base',
        ['primaryColor:light', 'primaryColor:dark', 'darkMode'],
        ['archGroupBorderColor']
      ),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys('base', ['none'], ['archEdgeColor', 'archEdgeArrowColor', 'archGroupBorderColor']),
];

describe('architecture colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(architecture.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
