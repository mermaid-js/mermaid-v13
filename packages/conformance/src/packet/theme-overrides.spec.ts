/**
 * #1037 (spec #1035 T0, D654): packet's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { packet } from '@mermaid-js/diagram-packet';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's packet colours: `capture-theme-overrides.ts packet`. */
const V12: ReferenceTable = {
  default: {},
  dark: {
    packetStartByteColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetEndByteColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetTitleColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetBlockStrokeColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetBlockFillColor: {
      none: '#333333',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
  },
  forest: {
    packetStartByteColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetEndByteColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetTitleColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetBlockStrokeColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
    packetBlockFillColor: {
      none: '#cde498',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
  },
  neutral: {},
  base: {},
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "D541: forest takes the light entry (black on #efefef), as no trait separates it from default, so an override of primaryTextColor or mainBkg leaves it, where v12 forest's block follows them":
    [
      ...keys(
        'forest',
        ['primaryTextColor:light', 'primaryTextColor:dark'],
        [
          'packetStartByteColor',
          'packetEndByteColor',
          'packetLabelColor',
          'packetTitleColor',
          'packetBlockStrokeColor',
        ]
      ),
      ...keys('forest', ['mainBkg:light', 'mainBkg:dark'], ['packetBlockFillColor']),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys(
    'forest',
    ['none'],
    [
      'packetStartByteColor',
      'packetEndByteColor',
      'packetLabelColor',
      'packetTitleColor',
      'packetBlockStrokeColor',
      'packetBlockFillColor',
    ]
  ),
];

describe('packet colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(packet.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
