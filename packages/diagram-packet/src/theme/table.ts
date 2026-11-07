import type { DiagramThemeEntries, DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/** The light entry's colours (v12 `styles.ts`): the fallback under every theme. */
const LIGHT = {
  packetStartByteColor: 'black',
  packetEndByteColor: 'black',
  packetLabelColor: 'black',
  packetTitleColor: 'black',
  packetBlockStrokeColor: 'black',
  packetBlockFillColor: '#efefef',
} as const;

/** v12 `styles.ts`'s lengths in px; the dark entry falls back to them. */
const LENGTHS = {
  packetByteFontSize: 10,
  packetLabelFontSize: 12,
  packetTitleFontSize: 14,
  packetBlockStrokeWidth: 1,
} as const;

/** The dark entry (v12 `theme-dark.js:328-335`), over the light one in a family's dark themes. */
const DARK: DiagramThemeEntries = {
  rules: {
    packetStartByteColor: 'primaryTextColor',
    packetEndByteColor: 'primaryTextColor',
    packetLabelColor: 'primaryTextColor',
    packetTitleColor: 'primaryTextColor',
    packetBlockStrokeColor: 'primaryTextColor',
    packetBlockFillColor: 'background',
  },
};

/**
 * Packet draws alike in every family (D227): v12's lengths, and the dark colours in the family's
 * dark themes.
 */
const ENTRIES_FOR_EVERY_FAMILY = { tokens: LENGTHS, dark: DARK };

/**
 * Packet's theme table (`DiagramPlugin.theme`, D331, D335, D540, spec #421 "v13 entries"): the
 * variables of `vocabulary.ts` in section `packet`. It names no theme (D331): every family takes
 * the light entry (v12's literals) and, in its dark themes (the `dark` trait, not the author's
 * `darkMode`, as v12 keyed packet by theme), the dark entry (v12 `dark`'s `primaryTextColor` inks
 * on `background`). The lengths are the same in every theme.
 */
export const theme: DiagramThemeTable = {
  section: 'packet',
  vars: THEME_VARIABLE_TABLE,
  rules: { light: LIGHT },
  families: {
    classic: ENTRIES_FOR_EVERY_FAMILY,
    redux: ENTRIES_FOR_EVERY_FAMILY,
    neo: { fallback: 'redux' },
  },
};
