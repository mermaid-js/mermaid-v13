/**
 * #1037 (spec #1035 T0, D654): sequence's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { sequence } from '@mermaid-js/diagram-sequence';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's sequence colours: `capture-theme-overrides.ts sequence`. */
const V12: ReferenceTable = {
  default: {
    actorTextColor: '#000000',
    actorLineColor: '#9370db',
    signalColor: '#333333',
    signalTextColor: '#333333',
    labelBoxBkgColor: { none: '#ececff', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    labelBoxBorderColor: '#9370db',
    labelTextColor: '#000000',
    loopTextColor: '#000000',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
    rectBkgColor: '#f9ffec',
  },
  dark: {
    actorTextColor: '#d3d3d3',
    actorLineColor: '#cccccc',
    signalColor: '#d3d3d3',
    signalTextColor: '#d3d3d3',
    labelBoxBkgColor: { none: '#1f2020', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    labelBoxBorderColor: '#cccccc',
    labelTextColor: '#d3d3d3',
    loopTextColor: '#d3d3d3',
    activationBkgColor: { none: '#474949', 'mainBkg:light': '#ffedb8', 'mainBkg:dark': '#4178a3' },
    activationBorderColor: '#cccccc',
    sequenceNumberColor: '#000000',
    rectBkgColor: {
      none: '#201f1f',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
  },
  forest: {
    actorTextColor: '#000000',
    actorLineColor: { none: '#a6cf47', 'mainBkg:light': '#ffc000', 'mainBkg:dark': '#0d1820' },
    signalColor: '#333333',
    signalTextColor: '#333333',
    labelBoxBkgColor: { none: '#cde498', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    labelBoxBorderColor: '#326932',
    labelTextColor: '#000000',
    loopTextColor: '#000000',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
    rectBkgColor: {
      none: '#e1efc0',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
  },
  neutral: {
    actorTextColor: '#333333',
    actorLineColor: '#d4d4d4',
    signalColor: '#333333',
    signalTextColor: '#333333',
    labelBoxBkgColor: { none: '#eeeeee', 'mainBkg:light': '#ffd966', 'mainBkg:dark': '#2a4d69' },
    labelBoxBorderColor: '#d4d4d4',
    labelTextColor: '#333333',
    loopTextColor: '#333333',
    activationBkgColor: '#f4f4f4',
    activationBorderColor: '#666666',
    sequenceNumberColor: '#ffffff',
    rectBkgColor: {
      none: '#eeeeee',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
  },
  base: {
    actorTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    actorLineColor: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    signalColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    signalTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    labelBoxBkgColor: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    labelBoxBorderColor: {
      none: '#eeddbb',
      'primaryColor:light': '#d6b85c',
      'primaryColor:dark': '#2f3031',
      darkMode: '#ffffff',
    },
    labelTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    loopTextColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
    activationBkgColor: {
      none: '#f4ddff',
      'primaryColor:light': '#d966ff',
      'primaryColor:dark': '#4d692a',
      'secondaryColor:light': '#ffd966',
      'secondaryColor:dark': '#2a4d69',
    },
    activationBorderColor: {
      none: '#e3aaff',
      'primaryColor:light': '#cc33ff',
      'primaryColor:dark': '#32451b',
      'secondaryColor:light': '#ffcc33',
      'secondaryColor:dark': '#1b3245',
    },
    sequenceNumberColor: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
      'lineColor:light': '#002699',
      'lineColor:dark': '#d5b296',
    },
    rectBkgColor: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "#1035 T3 (#1040): sequence's variables do not respond to an override as v12's do (D656); T3 deletes this group":
    [
      ...keys('default', ['tertiaryColor:light', 'tertiaryColor:dark'], ['rectBkgColor']),
      ...keys(
        'dark',
        ['secondaryColor:light', 'secondaryColor:dark', 'mainBkg:light', 'mainBkg:dark'],
        ['activationBkgColor']
      ),
      ...keys('forest', ['mainBkg:light', 'mainBkg:dark'], ['actorLineColor']),
    ],
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [
      ...keys(
        'base',
        ['darkMode'],
        ['actorTextColor', 'signalColor', 'signalTextColor', 'labelTextColor', 'loopTextColor']
      ),
    ],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [
  ...keys('base', ['none'], ['actorLineColor', 'labelBoxBorderColor', 'activationBorderColor']),
];

describe('sequence colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(sequence.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
