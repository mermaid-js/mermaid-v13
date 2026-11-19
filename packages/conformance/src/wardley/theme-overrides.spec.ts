/**
 * #1037 (spec #1035 T0, D654): wardley's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { wardley } from '@mermaid-js/diagram-wardley';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's wardley colours: `capture-theme-overrides.ts wardley`. */
const V12: ReferenceTable = {
  default: {
    wardleyBackgroundColor: '#ffffff',
    wardleyAxisColor: '#333333',
    wardleyAxisTextColor: '#131300',
    wardleyGridColor: '#d3d3d3',
    wardleyComponentFill: '#ffffff',
    wardleyComponentStroke: '#333333',
    wardleyComponentLabelColor: '#131300',
    wardleyLinkStroke: '#333333',
    wardleyEvolutionStroke: '#dc3545',
    wardleyAnnotationStroke: '#333333',
    wardleyAnnotationTextColor: '#131300',
    wardleyAnnotationFill: '#ffffff',
    wardleyEvolutionColor: '#dc3545',
  },
  dark: {
    wardleyBackgroundColor: {
      none: '#333333',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyAxisColor: '#d3d3d3',
    wardleyAxisTextColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyGridColor: '#d3d3d3',
    wardleyComponentFill: {
      none: '#1f2020',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    wardleyComponentStroke: '#d3d3d3',
    wardleyComponentLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyLinkStroke: '#d3d3d3',
    wardleyEvolutionStroke: '#ff6b6b',
    wardleyAnnotationStroke: '#d3d3d3',
    wardleyAnnotationTextColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyAnnotationFill: {
      none: '#1f2020',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    wardleyEvolutionColor: '#ff6b6b',
  },
  forest: {
    wardleyBackgroundColor: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyAxisColor: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAxisTextColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyGridColor: '#d3d3d3',
    wardleyComponentFill: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyComponentStroke: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyComponentLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyLinkStroke: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyEvolutionStroke: '#dc3545',
    wardleyAnnotationStroke: {
      none: '#000000',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAnnotationTextColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyAnnotationFill: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyEvolutionColor: '#dc3545',
  },
  neutral: {
    wardleyBackgroundColor: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyAxisColor: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAxisTextColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyGridColor: '#e6e6e6',
    wardleyComponentFill: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyComponentStroke: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyComponentLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyLinkStroke: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyEvolutionStroke: '#dc3545',
    wardleyAnnotationStroke: {
      none: '#666666',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAnnotationTextColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    wardleyAnnotationFill: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyEvolutionColor: '#dc3545',
  },
  base: {
    wardleyBackgroundColor: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyAxisColor: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAxisTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    wardleyGridColor: '#d3d3d3',
    wardleyComponentFill: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyComponentStroke: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyComponentLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    wardleyLinkStroke: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyEvolutionStroke: '#dc3545',
    wardleyAnnotationStroke: {
      none: '#0b0b0b',
      'background:light': '#002699',
      'background:dark': '#d5b296',
      'lineColor:light': '#ffd966',
      'lineColor:dark': '#2a4d69',
    },
    wardleyAnnotationTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    wardleyAnnotationFill: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    wardleyEvolutionColor: '#dc3545',
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        ['wardleyAxisTextColor', 'wardleyComponentLabelColor', 'wardleyAnnotationTextColor']
      ),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [...keys('neutral', ['none'], ['wardleyGridColor'])];

describe('wardley colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(wardley.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
