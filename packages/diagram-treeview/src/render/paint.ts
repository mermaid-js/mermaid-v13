// The colours the treeView renderer draws with (spec #518 T4, D215, D227, D483): treeView's
// own theme variables (`theme/table.ts`), one per v12 `styles.ts` rule. TreeView has no
// theme-name or `look` branch (D227).
import type { RenderContext } from '@mermaid-js/core';
import type { Paint } from '@mermaid-js/core/svg';
import type { TreeViewLayout, TreeViewRow } from '../layout/index.ts';

type Theme = RenderContext['theme'];

export interface Paints {
  /** `.treeView-node-label`'s fill. */
  readonly label: Paint;
  /** `.treeView-node-line`'s stroke. */
  readonly line: Paint;
  /** `.treeView-node-icon`'s `color`, which the glyphs' `currentColor` takes. */
  readonly icon: Paint;
  /** `.treeView-node-description`'s fill. */
  readonly description: Paint;
  /** `.treeView-highlight-bg`'s fill and stroke. */
  readonly highlightBg: Paint;
  readonly highlightStroke: Paint;
}

/** For a paint nothing in this layout draws with. */
const UNUSED: Paint = 'currentColor';

/**
 * Every paint the treeView uses, read before the root is written so that it declares their
 * aliases: only the ones something drawn uses (every tree has a label, the root row's `/`).
 */
export function paints(theme: Theme, layout: TreeViewLayout): Paints {
  const has = (f: (r: TreeViewRow) => unknown): boolean => layout.rows.some(f);
  const highlight = has((r) => r.highlight);
  return {
    label: theme.color('treeViewLabelColor'),
    line: layout.lines.length > 0 ? theme.color('treeViewLineColor') : UNUSED,
    icon: has((r) => r.icon) ? theme.color('treeViewIconColor') : UNUSED,
    description: has((r) => r.description) ? theme.color('treeViewDescriptionColor') : UNUSED,
    highlightBg: highlight ? theme.color('treeViewHighlightBg') : UNUSED,
    highlightStroke: highlight ? theme.color('treeViewHighlightStroke') : UNUSED,
  };
}
