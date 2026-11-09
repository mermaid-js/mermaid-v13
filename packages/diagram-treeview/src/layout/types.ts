// cspell:words preorder
/**
 * TreeViewLayout: the plain-data result of the treeView custom layout (`layoutKind: 'custom'`,
 * D481). Every length is in px, in the diagram's coordinates (treeView draws SVG; the ASCII
 * renderer reads the model). Rectangles have their top-left corner at `x`, `y`.
 */
import type { FontKey } from '@mermaid-js/core/text';
import type { TreeViewNode } from '../model.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * One line of plain text (D484), measured in `font`: drawn with `dominant-baseline: middle` and
 * `text-anchor: start` at (`x`, `y`), so it spans `x` to `x + width` and is `height` high
 * around `y` (0 high for an empty text, as v12's `getBBox`).
 */
export interface TreeViewText {
  readonly text: string;
  readonly font: FontKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A row's icon: the name `resolveIcon` gave (`pack:name`) and its 14 × 14 box. */
export interface TreeViewIcon {
  readonly name: string;
  readonly box: Rect;
}

/** The highlight box behind a `:::highlight` row (`rect.treeView-highlight-bg`). */
export interface TreeViewHighlight {
  readonly box: Rect;
  /** The corner radius (`rx`). */
  readonly radius: number;
}

/** One row of the tree: v12's virtual root `/` first, then every node in preorder (D482). */
export interface TreeViewRow {
  /** The model's node; absent for the root row `/`. */
  readonly node?: TreeViewNode;
  /** 0 for the root row, the node's depth plus 1 for the others. */
  readonly depth: number;
  /** The label as drawn: the name (`/` for the root row). */
  readonly text: string;
  /** A directory (the root row is one): its label is bold. */
  readonly directory: boolean;
  /**
   * v12's `node.BBox`: from the indent, `width` the label plus the paddings and the icon slot,
   * `height` the label plus `2 × paddingY`.
   */
  readonly box: Rect;
  readonly label: TreeViewText;
  /** Absent when the row draws no icon (`resolveIcon` gave none). */
  readonly icon?: TreeViewIcon;
  /** In the description column, italic, at the row's centre; absent with none. */
  readonly description?: TreeViewText;
  /** Absent unless the row's class is `highlight`. */
  readonly highlight?: TreeViewHighlight;
}

/**
 * A connector, `lineThickness` wide: a `branch` into a row from its parent's stem (every row
 * but the root), at the row's centre; a `stem` down from a parent's row to its last child's
 * centre. `row` is the index in `rows` of the row it goes into, or comes down from.
 */
export interface TreeViewLine {
  readonly kind: 'branch' | 'stem';
  readonly row: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface TreeViewLayout {
  /** The root row, then the model's nodes in preorder. */
  readonly rows: readonly TreeViewRow[];
  /** In v12's drawing order: a row's branch as it is placed, a parent's stem after its subtree. */
  readonly lines: readonly TreeViewLine[];
  /** The connectors' stroke width (`treeView.lineThickness`). */
  readonly lineThickness: number;
  /** v12's `totalWidth` and `totalHeight` (its viewBox size). */
  readonly width: number;
  readonly height: number;
  /**
   * What is drawn (D224): v12's viewBox (`-lineThickness / 2`, 0, `width`, `height`), grown
   * wherever something drawn reaches past it.
   */
  readonly bounds: Rect;
}
