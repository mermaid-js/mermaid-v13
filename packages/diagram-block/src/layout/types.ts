/**
 * BlockLayout: the plain-data result of the block custom layout (`layoutKind: 'custom'`, spec
 * #521 §Layout (T3), D224). Every length is in px. Rectangles have their top-left corner at `x`,
 * `y`; outlines are in their block's frame, about its centre (`../shapes/outline.ts`).
 */
import type { AstId } from '@mermaid-js/core/parser-kit';
import type { FontKey, MeasuredLabel } from '@mermaid-js/core/text';
import type { BlockArrowType, BlockEdge, BlockType } from '../model.ts';
import type { LeafShape } from '../shapes/leaf.ts';
import type { Outline, Point } from '../shapes/outline.ts';

export type { Outline, Point } from '../shapes/outline.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A measured label and its box; its first baseline is at `y + text.baseline`. */
export interface PlacedLabel extends Rect {
  readonly text: MeasuredLabel;
  /** The font it was measured in, so is drawn in (pitfall 16). */
  readonly font: FontKey;
}

/** What a block is drawn as: a flowchart shape, the block arrow, a composite, or nothing. */
export type BlockShape = LeafShape | 'block-arrow' | 'composite' | 'space';

/** One block, or one cell of a `space:n`. */
export interface BlockNodeLayout {
  /** v12's id; a space's cells are `<id>-<j>` (v12's clones). */
  readonly id: string;
  readonly ast: AstId;
  readonly type: BlockType;
  readonly shape: BlockShape;
  /** The parent's index in {@link BlockLayout.blocks}; undefined at the top level. */
  readonly parent?: number;
  /** Columns taken (v12 `widthInColumns`); 1 for a space's cell. */
  readonly span: number;
  /** A block with children: its `columns` (-1 for `auto`), undefined without a statement. */
  readonly columns?: number;
  /** v12's grid cell (`block.size`). */
  readonly cell: Rect;
  /**
   * The outline's box: the cell for the shapes that fill it (at least the shape's natural size,
   * as v12's `rect`), the natural size centred for circle, double circle and diamond, the block
   * arrow's polygon (as wide as its cell only when it spans and the cell is wider). A space
   * draws nothing: its box is its cell.
   */
  readonly box: Rect;
  /** Absent for a space. */
  readonly outline?: Outline;
  /** The centre the outline is about. */
  readonly centre: Point;
  /**
   * The label: a leaf's centred on its shape (moved down by the cylinder's cap); a labelled
   * composite's centred in its band (D444). Absent for a space and an unlabelled composite.
   */
  readonly label?: PlacedLabel;
  /** A composite's palette slot as the model numbered it (#556 takes it modulo the palette). */
  readonly colorIndex?: number;
}

export interface BlockEdgeLayout {
  readonly id: string;
  readonly ast: AstId;
  readonly start: string;
  readonly end: string;
  /**
   * `line`: v12's segment between the centres, clipped at both outlines, its middle point the
   * centres' midpoint (`[start, middle, end]`). `loop`: a self-loop (D441) as one cubic Bézier,
   * `[start, control, control, end]`, from and back to the block's outline.
   */
  readonly kind: 'line' | 'loop';
  readonly points: readonly Point[];
  readonly arrowTypeStart: BlockArrowType;
  readonly arrowTypeEnd: BlockArrowType;
  readonly thickness: BlockEdge['thickness'];
  readonly pattern: BlockEdge['pattern'];
  /** Centred on the middle point (a loop's apex); absent without a label. */
  readonly label?: PlacedLabel;
}

export interface BlockLayout {
  /** The top level's `columns` (-1 for `auto` or none). */
  readonly columns: number;
  /** In pre-order: each composite before its children, as v12 inserted them. */
  readonly blocks: readonly BlockNodeLayout[];
  /** In source order; an edge whose end is no block is left out. */
  readonly edges: readonly BlockEdgeLayout[];
  /** The `block.padding` laid out with. */
  readonly padding: number;
  /** Everything drawn (D224), and the 5 px margin v12's viewBox had. */
  readonly bounds: Rect;
}
