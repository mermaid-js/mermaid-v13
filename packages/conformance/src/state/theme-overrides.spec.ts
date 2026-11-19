/**
 * #1037 (spec #1035 T0, D654): state's theme-table colours in the five classic themes against v12
 * 12.2.0 under the override matrix of `override-matrix.ts`. Where a variable matches v12 with no
 * override, it must match under every override; where it differs with no override, it must move
 * under exactly the overrides that move v12's. v12's values are the literals of `V12`, printed by
 * the capture tool (`override-matrix.ts` says how to run it), so the spec runs without v12. Each
 * difference is listed in `DIFFERENCES` as `theme / override / variable`, under the decision that
 * accounts for it, or the ticket of spec #1035 that deletes it: an unlisted difference fails, and
 * so does a listed one that has gone.
 */

import { state } from '@mermaid-js/diagram-state';
import { describe } from 'vitest';
import { describeDiagramOverrides, keys, type ReferenceTable } from '../override-matrix.ts';

/** v12 12.2.0's state colours: `capture-theme-overrides.ts state`. */
const V12: ReferenceTable = {
  default: {
    compositeBackground: '#ffffff',
    compositeTitleBackground: '#ececff',
    altBackground: '#f0f0f0',
    stateLabelColor: '#131300',
  },
  dark: {
    compositeBackground: {
      none: '#333333',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    compositeTitleBackground: {
      none: '#1f2020',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    altBackground: '#555555',
    stateLabelColor: {
      none: '#e0dfdf',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  forest: {
    compositeBackground: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    compositeTitleBackground: {
      none: '#cde498',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    altBackground: '#f0f0f0',
    stateLabelColor: {
      none: '#321b67',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  neutral: {
    compositeBackground: {
      none: '#ffffff',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    compositeTitleBackground: {
      none: '#eeeeee',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    altBackground: '#f4f4f4',
    stateLabelColor: {
      none: '#111111',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
    },
  },
  base: {
    compositeBackground: {
      none: '#f4f4f4',
      'background:light': '#ffd966',
      'background:dark': '#2a4d69',
    },
    compositeTitleBackground: {
      none: '#fff4dd',
      'primaryColor:light': '#ffd966',
      'primaryColor:dark': '#2a4d69',
      'mainBkg:light': '#ffd966',
      'mainBkg:dark': '#2a4d69',
    },
    altBackground: {
      none: '#f6f9ff',
      'primaryColor:light': '#809fff',
      'primaryColor:dark': '#7b5231',
      'tertiaryColor:light': '#ffd966',
      'tertiaryColor:dark': '#2a4d69',
    },
    stateLabelColor: {
      none: '#333333',
      'primaryTextColor:light': '#ffd966',
      'primaryTextColor:dark': '#2a4d69',
      darkMode: '#eeeeee',
    },
  },
};

/**
 * Each difference from v12, keyed `theme / override / variable`, grouped by the decision that
 * accounts for it, or by the ticket of spec #1035 that deletes it (D654).
 */
const DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  "#1035 T3 (#1040): state's variables do not respond to an override as v12's do (D656); T3 deletes this group":
    [
      ...keys('default', ['background:light', 'background:dark'], ['compositeBackground']),
      ...keys('default', ['mainBkg:light', 'mainBkg:dark'], ['compositeTitleBackground']),
      ...keys('default', ['primaryTextColor:light', 'primaryTextColor:dark'], ['stateLabelColor']),
    ],
  "D571: v12's darkMode turns base's primaryTextColor, and the text inks that follow it, to #eee; v13's darkMode switches only the derivation rules":
    [...keys('base', ['darkMode'], ['stateLabelColor'])],
};

/**
 * The variables that differ from v12 with no override, which the type's no-override spec
 * accounts for: each is compared by its response only (D654).
 */
const RESPONSE_ONLY: readonly string[] = [];

describe('state colours under one override, against v12 12.2.0 (#1037, D654)', () => {
  describeDiagramOverrides(state.theme, {
    reference: V12,
    differences: DIFFERENCES,
    responseOnly: RESPONSE_ONLY,
  });
});
