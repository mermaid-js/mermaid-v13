import type { DiagramThemeEntries, DiagramThemeTable } from '@mermaid-js/core/theme';
import { THEME_VARIABLE_TABLE } from './generated/variables.ts';

/** v12 `styles.ts`'s colours: the light entry, under every theme. */
const LIGHT = {
  treeViewLabelColor: 'black',
  treeViewLineColor: 'black',
  treeViewIconColor: '#546e7a',
  treeViewDescriptionColor: '#6a9955',
  treeViewHighlightStroke: '#ffc107',
} as const;

/**
 * The dark entry (D483), over the light one in a family's dark themes: the label ink and the
 * connectors follow the theme's `textColor` and `lineColor`, the icons take blue grey 300, the
 * dark counterpart of `#546e7a`. The description green and the highlight read on both, and stay.
 */
const DARK: DiagramThemeEntries = {
  rules: { treeViewLabelColor: 'textColor', treeViewLineColor: 'lineColor' },
  values: { treeViewIconColor: '#90a4ae' },
};

/**
 * v12's `labelFontSize` (`16px`) and highlight fill in every family (the fill is a literal: a
 * rule has no `rgba()`; it is the same in the dark entry), and the dark entry in its dark themes.
 */
const ENTRIES_FOR_EVERY_FAMILY = {
  tokens: { treeViewLabelFontSize: 16 },
  values: { treeViewHighlightBg: 'rgba(255, 193, 7, 0.15)' },
  dark: DARK,
};

/**
 * TreeView's theme table (`DiagramPlugin.theme`, D331, D335, D540, D483, spec #518 T4): the
 * variables of `vocabulary.ts` in section `treeView`. It names no theme (D331): every family
 * takes the light entry (v12's literals, which v12 drew in every theme) and, in its dark themes
 * (the `dark` trait, not the author's `darkMode`: v12 never varied them), the dark entry.
 */
export const theme: DiagramThemeTable = {
  section: 'treeView',
  vars: THEME_VARIABLE_TABLE,
  rules: { light: LIGHT },
  families: {
    classic: ENTRIES_FOR_EVERY_FAMILY,
    redux: ENTRIES_FOR_EVERY_FAMILY,
    neo: { fallback: 'redux' },
  },
};
