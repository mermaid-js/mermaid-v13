import type { DiagramThemeVarDef } from '@mermaid-js/core/theme';

/** `usedBy` of every row: treeView reads them all. */
const TREEVIEW: readonly string[] = ['treeview'];

/**
 * TreeView's theme variables (spec #518 T4, D483; not core's, R-PERF-8): v12 `styles.ts`'s seven
 * `treeView` style options, under v12's nested keys (D335, D540: `themeVariables.treeView.lineColor`
 * sets `treeViewLineColor`, key by key; the flat name wins).
 *
 * - `treeViewLabelFontSize`: the label and description size, which the layout measures in.
 * - `treeViewLabelColor`, `treeViewLineColor`, `treeViewIconColor`, `treeViewDescriptionColor`:
 *   the label ink, the connectors, the icons' `currentColor` and the descriptions.
 * - `treeViewHighlightBg`, `treeViewHighlightStroke`: a `:::highlight` row's box.
 *
 * `pnpm gen:theme` writes `generated/variables.ts` from them.
 */
export const THEME_VARIABLES: Readonly<Record<string, DiagramThemeVarDef>> = {
  treeViewLabelFontSize: {
    alias: 'tvf',
    kind: 'length',
    usedBy: TREEVIEW,
    nested: 'labelFontSize',
  },
  treeViewLabelColor: { alias: 'tvl', kind: 'color', usedBy: TREEVIEW, nested: 'labelColor' },
  treeViewLineColor: { alias: 'tvn', kind: 'color', usedBy: TREEVIEW, nested: 'lineColor' },
  treeViewIconColor: { alias: 'tvi', kind: 'color', usedBy: TREEVIEW, nested: 'iconColor' },
  treeViewDescriptionColor: {
    alias: 'tvd',
    kind: 'color',
    usedBy: TREEVIEW,
    nested: 'descriptionColor',
  },
  treeViewHighlightBg: { alias: 'tvh', kind: 'color', usedBy: TREEVIEW, nested: 'highlightBg' },
  treeViewHighlightStroke: {
    alias: 'tvk',
    kind: 'color',
    usedBy: TREEVIEW,
    nested: 'highlightStroke',
  },
};
