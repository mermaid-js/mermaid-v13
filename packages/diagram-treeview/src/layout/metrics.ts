/**
 * The treeView layout's px constants (spec #518 T3, pitfall 13): v12 `renderer.ts`'s fixed
 * lengths. No other file in `layout/` writes a length literal
 * (`packages/conformance/src/treeview-layout-literals.spec.ts`); every other length comes from
 * the `treeView` config, the theme (the label size, `treeViewLabelFontSize`, #575) or the
 * measurer.
 */

export interface TreeViewMetrics {
  /** The icon's width and height (`ICON_SIZE`). */
  readonly icon: number;
  /** Between the icon and the label (`ICON_GAP`). */
  readonly iconGap: number;
  /** Between the widest label's right edge and the description column (`DESC_GAP`). */
  readonly descriptionGap: number;
  /** The highlight box's inset from the row's top and bottom (`y + 1`, `height - 2`). */
  readonly highlightInset: number;
  /** The highlight box's corner radius (`rx 3`). */
  readonly highlightRadius: number;
  /** How far the highlight box runs past the diagram's width (`totalWidth - x + 8`). */
  readonly highlightOverhang: number;
  /** What v12 adds past each highlight box to the diagram's width (`x + rectWidth + 2`). */
  readonly highlightSlack: number;
  /** The highlight box's stroke width (`styles.ts`: `stroke-width: 1`). */
  readonly highlightStroke: number;
}

export const TREEVIEW_METRICS: TreeViewMetrics = {
  icon: 14,
  iconGap: 4,
  descriptionGap: 16,
  highlightInset: 1,
  highlightRadius: 3,
  highlightOverhang: 8,
  highlightSlack: 2,
  highlightStroke: 1,
};

/** CSS weights: directories are bold (`.treeView-node-dir`), everything else normal. */
export const BOLD_WEIGHT = 700;
export const NORMAL_WEIGHT = 400;
