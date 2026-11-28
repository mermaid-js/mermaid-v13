/**
 * BlockModel: the plain-data result of a block parse (spec #521 §Parser, T2) and the input of
 * the block layout. It keeps the data of v12's `blockDB.ts` (`getBlocks()`, `getEdges()`,
 * `getClasses()`), so model parity holds against it, with v12's five model bugs fixed (D442):
 *
 * - blocks form a tree in source order: each block sits where its id first appears (a leaf, a
 *   composite header or an edge end); a later mention merges into it, as v12's DB did: a type
 *   other than `na` replaces the type, a label other than the id replaces the label, and the
 *   span, directions and position stay the first's. A later `block:id … end` makes the block a
 *   composite and appends its children to the block's (D442; v12 dropped them);
 * - an `a --> b --> c` chain declares `a`, `b` and `c` and draws both edges (D442); as in v12,
 *   the span written after a chain's first node is dropped (`a:2 --> b` spans 1);
 * - `class` applies to an id declared later too (D442), and its id list is trimmed; `style`
 *   applies after every statement (D443), so later and unknown ids are fine (a
 *   `BLOCK_STYLE_UNKNOWN` warning lists the unknown ones);
 * - `root` is an ordinary id (D442): the top level is {@link BlockModel.blocks};
 * - degenerate sizes (D445): `columns 0` is `auto` (-1) and a span `:0` is 1
 *   (`BLOCK_SIZE_INVALID`); spans are capped at 1,000 and `space:n` at 100,000 cells
 *   (`BLOCK_TRUNCATED`); block-arrow directions are trimmed;
 * - generated ids (spaces, anonymous composites) are `id-<n>`, numbered from 1 in source order
 *   (R-ARCH-6), where v12 drew a `Math.random` id; no author id can take that form (`-` is not
 *   an id character);
 * - labels as v12's grammar handed them to its DB: entities as written (v12's `#35;` form reads
 *   `&#35;`), nothing decoded or sanitised (v13 writes text escaped). A markdown string, which
 *   v12's grammar rejected, is taken without its wrapper and marked `markdown` (#1401).
 */
import type { AstId, Diagnostic } from '@mermaid-js/core/parser-kit';

/** v12's block types (`blockTypes.ts`) that a block can have. */
export type BlockType =
  | 'na'
  | 'square'
  | 'round'
  | 'circle'
  | 'rect_left_inv_arrow'
  | 'diamond'
  | 'hexagon'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'doublecircle'
  | 'lean_right'
  | 'lean_left'
  | 'trapezoid'
  | 'inv_trapezoid'
  | 'block_arrow'
  | 'composite'
  | 'space';

export interface Block {
  /** The AST id of the block's first occurrence (`block:<id>`, `block:id-<n>`). */
  readonly ast: AstId;
  /** v12's `id`: as written, or `id-<n>` for a space or an anonymous composite. */
  readonly id: string;
  readonly type: BlockType;
  /** The quoted label, the id for a leaf without one, `''` for a composite without one. */
  readonly label: string;
  /**
   * Whether the label was a markdown string (`["`…`"]`), whose wrapper `label` does not hold: it
   * is laid out as markdown (#1401, as D712). Undefined otherwise.
   */
  readonly markdown?: true;
  /** Columns taken (v12 `widthInColumns`), 1 to 1,000. */
  readonly span: number;
  /** A composite's last `columns` (-1 for `auto`); undefined without one. */
  readonly columns?: number;
  /** For a space: how many cells of one column it takes (v12 cloned one block per cell). */
  readonly cells?: number;
  /** Block-arrow directions as written (trimmed): `right`, `left`, `x`, `y`, `up`, `down`. */
  readonly directions?: readonly string[];
  /** v12's `classes`: one entry per `class` statement naming the block, in source order. */
  readonly classes: readonly string[];
  /** v12's `styles`: the last `style` statement's text split at `,`, as written. */
  readonly styles: readonly string[];
  /** True for an anonymous `block … end`, whose id is generated (`id-<n>`). */
  readonly anonymous?: true;
  /** A composite's palette slot: composites numbered in declaration order (v12 `colorIndex`). */
  readonly colorIndex?: number;
  readonly children: readonly Block[];
}

/** v12's edge arrowheads. */
export type BlockArrowType = 'arrow_point' | 'arrow_circle' | 'arrow_cross' | 'arrow_open' | '';

export interface BlockEdge {
  /** `edge:<start>-><end>`, `@2`, `@3` for repeats (D448). */
  readonly ast: AstId;
  /** v12's `id`: `<k>-<start>-<end>` for the k-th edge between the two. */
  readonly id: string;
  readonly start: string;
  readonly end: string;
  /** The quoted label, or `''`. */
  readonly label: string;
  /** Whether the label was a markdown string (`-- "`…`" -->`), as {@link Block.markdown}. */
  readonly markdown?: true;
  readonly arrowTypeStart: BlockArrowType;
  readonly arrowTypeEnd: BlockArrowType;
  readonly thickness: 'normal' | 'thick';
  readonly pattern: 'solid' | 'dotted';
}

/** A `classDef` (v12 `ClassDef`); repeats add to the first. */
export interface BlockClassDef {
  readonly id: string;
  readonly styles: readonly string[];
  /** The styles with `color` in them, `fill` → `bgFill` and `color` → `fill` (v12). */
  readonly textStyles: readonly string[];
}

export interface BlockModel {
  /** The top-level blocks in source order. */
  readonly blocks: readonly Block[];
  /** The top level's last `columns` (-1 for `auto` or none). */
  readonly columns: number;
  /** In source order. Edges never merge. */
  readonly edges: readonly BlockEdge[];
  /** In order of first definition. */
  readonly classDefs: readonly BlockClassDef[];
  /** Warning diagnostics of the parse (also in `ParseResult.diagnostics`). */
  readonly warnings: readonly Diagnostic[];
}

/**
 * Whether `block` is drawn as a composite, a frame around its children: its type, by v12's
 * merge rule (a later type other than `na` wins, GAPS #554), never whether it holds children.
 * A composite a later mention turns into a leaf type (`block:a … end` then `a(("x"))`) keeps
 * its children but is drawn as that leaf. The layout, the SVG renderer, the text grid and the
 * hover all read this.
 */
export const isComposite = (block: Pick<Block, 'type'>): boolean => block.type === 'composite';
