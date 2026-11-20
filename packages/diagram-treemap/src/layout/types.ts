/**
 * TreemapLayout: the plain-data result of the treemap custom layout (`layoutKind: 'custom'`,
 * spec #428 §Layout). Every length is in px (treemap draws SVG only, D320), in the diagram's
 * coordinates: v12 translated its container down by the title band, here every box already
 * is. Rectangles have their top-left corner at `x`, `y`.
 */
import type { FontKey } from '@mermaid-js/core/text';
import type { Rect } from '@mermaid-js/shared/layout';
import type { TreemapNode } from '../model.ts';

export type { Rect };

/** `r` grown by `by` on every side (a stroke's outer half, or a padding band). */
export function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, width: r.width + 2 * by, height: r.height + 2 * by };
}

/** v12's `text-anchor` and `dominant-baseline` for a text at its point. */
export type TreemapTextAnchor = 'start' | 'middle' | 'end';
export type TreemapBaseline = 'middle' | 'hanging';

/**
 * One line of plain text (D405: entities decoded, tags printed as written), measured in `font`
 * and placed by `anchor` and `baseline` at (`x`, `y`). `box` is its extent: the measured width
 * by the font size, the height v12 fitted against.
 */
export interface TreemapText {
  readonly text: string;
  readonly font: FontKey;
  readonly x: number;
  readonly y: number;
  readonly anchor: TreemapTextAnchor;
  readonly baseline: TreemapBaseline;
  readonly box: Rect;
}

/** What sections and leaves share. */
interface TreemapItem {
  /** The model row. */
  readonly node: TreemapNode;
  /** d3's depth: 1 for a top-level row (the hidden root is 0 and is not drawn). */
  readonly depth: number;
  /** d3's sum: the leaf's value (`NaN` read as 0, D402), or the sum of the section's leaves. */
  readonly value: number;
  /** d3's rounded rectangle, moved down by the title band. */
  readonly box: Rect;
  /**
   * The name the fill and stroke scales are looked up by: a section's own, a leaf's parent's
   * (the hidden root's `''` for a top-level leaf, D404).
   */
  readonly colorKey: string;
  /**
   * v12's slot in the fill range `['transparent', cScale0…cScale11]` and the stroke range
   * `['transparent', cScalePeer0…11]` (the same domain), by the first-lookup index of
   * `colorKey`, the hidden root's `''` first: 0 is the root's, `transparent`; every later name
   * cycles through 1…12 (D612; v12 took the index mod 13, so its 13th name was transparent).
   */
  readonly fill: number;
  /** v12's slot in `cScaleLabel0…11`: the first-lookup index of the item's own name, mod 12. */
  readonly labelColor: number;
  /** The label; absent when hidden (it did not fit). */
  readonly label?: TreemapText;
  /**
   * The formatted value; absent when hidden: `showValues: false`, a zero or non-finite value
   * (D402), or (leaves) no room or no label.
   */
  readonly valueText?: TreemapText;
}

/** A row with children (v12 `g.treemapSection`). */
export interface TreemapSectionLayout extends TreemapItem {
  /** v12's `section<index>`: its index among d3's nodes with children, the hidden root's 0 counted. */
  readonly index: number;
  /** The header band (`rect.treemapSectionHeader`): the box's top, `sectionHeader` high. */
  readonly header: Rect;
}

/**
 * A row without children (v12 `g.treemapLeafGroup`): every leaf, and a section with no rows
 * under it, which d3 treats as a leaf.
 */
export interface TreemapLeafLayout extends TreemapItem {
  /** v12's `leaf<index>`: its index in d3's `leaves()`. */
  readonly index: number;
}

export interface TreemapLayout {
  /** The treemap's area: `nodeWidth × 10` by `nodeHeight × 10`, below the title band. */
  readonly width: number;
  readonly height: number;
  /** The band above the treemap: 30 with a title, else 0. */
  readonly titleBand: number;
  /** `treemap.padding`: d3's `paddingInner`, the gap between siblings. */
  readonly padding: number;
  /** More than 20 leaves: the smaller leaf fonts (v12 `isComplexTreemap`). */
  readonly complex: boolean;
  /** Sections in d3's `descendants()` order (breadth first), the hidden root left out. */
  readonly sections: readonly TreemapSectionLayout[];
  /** Leaves in d3's `leaves()` order (depth first). */
  readonly leaves: readonly TreemapLeafLayout[];
  /** At `(width / 2, titleBand / 2)`, middle-anchored; absent without a title. */
  readonly title?: TreemapText;
  /**
   * What is drawn (D224), stroke half-widths included, padded by `diagramPadding` on every
   * side; with no rows, the canvas (v12 drew the hidden root as one transparent leaf).
   */
  readonly bounds: Rect;
}
