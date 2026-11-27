/**
 * #1037 (spec #1035 T0, D654): agentflow's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { agentflow } from '@mermaid-js/diagram-agentflow';
import { describe } from 'vitest';
import { describeTagVariables } from '../edge-label-tag-paint.ts';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's agentflow colours: `capture-theme-overrides.ts agentflow`. */
const V12: ReferenceTable = {
  default: {
    flowContainerStroke: '#eeeebc',
  },
  dark: {
    flowContainerStroke: '#2f2f2f',
  },
  forest: {
    flowContainerStroke: '#b4e599',
  },
  neutral: {
    flowContainerStroke: '#e3e3e3',
  },
  base: {
    flowContainerStroke: {
      none: '#ddbbee',
      'primaryColor:light': '#b85cd6',
      'primaryColor:dark': '#30312f',
      'secondaryColor:light': '#d6b85c',
      'secondaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
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
const RESPONSE_ONLY: readonly string[] = [...keys('base', ['none'], ['flowContainerStroke'])];

describe('agentflow colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(agentflow.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});

describe('the agentflow edge-label tag (#1348, D713, D715)', () => {
  describeTagVariables('agentflow', 'agentflow', ['tags', 'tags-in-container']);
});
