/**
 * #1037 (spec #1035 T0, D654): eventmodeling's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it (a D-id with a MIGRATION row): an unlisted difference fails, and so does a
 * listed one that has gone.
 */

import { eventmodeling } from '@mermaid-js/diagram-eventmodeling';
import { describe } from 'vitest';
import { describeDiagramOverrides, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's eventmodeling colours: `capture-theme-overrides.ts eventmodeling`. */
const V12: ReferenceTable = {
  default: {
    emUiFill: '#ffffff',
    emUiStroke: '#dbdada',
    emProcessorFill: '#edb3f6',
    emProcessorStroke: '#b88cbf',
    emReadModelFill: '#d3f1a2',
    emReadModelStroke: '#a3b732',
    emCommandFill: '#bcd6fe',
    emCommandStroke: '#679ac3',
    emEventFill: '#ffb778',
    emEventStroke: '#c19a0f',
    emSwimlaneBackgroundOdd: '#fafafa',
    emSwimlaneBackgroundStroke: '#f0f0f0',
    emRelationStroke: '#333333',
    emArrowhead: '#333333',
  },
  dark: {
    emUiFill: '#2d2d2d',
    emUiStroke: '#555555',
    emProcessorFill: '#78517b',
    emProcessorStroke: '#8a6d8c',
    emReadModelFill: '#547c3e',
    emReadModelStroke: '#6d8c5c',
    emCommandFill: '#3e547c',
    emCommandStroke: '#5c6d8c',
    emEventFill: '#7c5f3e',
    emEventStroke: '#8c755c',
    emSwimlaneBackgroundOdd: {
      none: '#404040',
      'background:light': '#ffdf80',
      'background:dark': '#315a7b',
    },
    emSwimlaneBackgroundStroke: {
      none: '#525252',
      'background:light': '#ffe8a3',
      'background:dark': '#3b6d95',
    },
    emRelationStroke: '#d3d3d3',
    emArrowhead: '#d3d3d3',
  },
  forest: {
    emUiFill: '#ffffff',
    emUiStroke: '#dbdada',
    emProcessorFill: '#edb3f6',
    emProcessorStroke: '#b88cbf',
    emReadModelFill: '#d3f1a2',
    emReadModelStroke: '#a3b732',
    emCommandFill: '#bcd6fe',
    emCommandStroke: '#679ac3',
    emEventFill: '#ffb778',
    emEventStroke: '#c19a0f',
    emSwimlaneBackgroundOdd: '#fafafa',
    emSwimlaneBackgroundStroke: '#f0f0f0',
    emRelationStroke: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    emArrowhead: { none: '#000000', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
  },
  neutral: {
    emUiFill: '#ffffff',
    emUiStroke: '#dbdada',
    emProcessorFill: '#edb3f6',
    emProcessorStroke: '#b88cbf',
    emReadModelFill: '#d3f1a2',
    emReadModelStroke: '#a3b732',
    emCommandFill: '#bcd6fe',
    emCommandStroke: '#679ac3',
    emEventFill: '#ffb778',
    emEventStroke: '#c19a0f',
    emSwimlaneBackgroundOdd: '#fafafa',
    emSwimlaneBackgroundStroke: '#f0f0f0',
    emRelationStroke: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    emArrowhead: { none: '#666666', 'lineColor:light': '#ffd966', 'lineColor:dark': '#2a4d69' },
  },
  base: {
    emUiFill: '#ffffff',
    emUiStroke: '#dbdada',
    emProcessorFill: '#edb3f6',
    emProcessorStroke: '#b88cbf',
    emReadModelFill: '#d3f1a2',
    emReadModelStroke: '#a3b732',
    emCommandFill: '#bcd6fe',
    emCommandStroke: '#679ac3',
    emEventFill: '#ffb778',
    emEventStroke: '#c19a0f',
    emSwimlaneBackgroundOdd: '#fafafa',
    emSwimlaneBackgroundStroke: '#f0f0f0',
    emRelationStroke: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    emArrowhead: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
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

describe('eventmodeling colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(eventmodeling.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
