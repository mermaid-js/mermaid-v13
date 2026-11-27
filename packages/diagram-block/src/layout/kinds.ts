/**
 * What each kind of block is drawn as, in one table: the shape a block type takes (v12's
 * `getNodeFromBlock`), and, per kind of shape, its natural size about its label and its outline
 * in its cell. Square, round and `na` are flowchart's `rect`, round with v12's corner radius
 * (sized as the square, not as flowchart's rounded rectangle); the composite and the block
 * arrow have kinds of their own; a space is measured as nothing and draws nothing.
 */
import { isComposite, type BlockType } from '../model.ts';
import { blockArrowPolygon, blockArrowReach, blockArrowSize } from '../shapes/block-arrow.ts';
import { keepsSize, leafOutline, leafSize, type LeafShape, type Pads } from '../shapes/leaf.ts';
import type { Outline, Point } from '../shapes/outline.ts';
import { BLOCK_METRICS } from './metrics.ts';
import type { BlockShape } from './types.ts';

/** The shape each block type is drawn as. */
export const SHAPE_OF: Readonly<Record<BlockType, BlockShape>> = {
  na: 'rect',
  square: 'rect',
  round: 'rect',
  circle: 'circle',
  doublecircle: 'dbl-circ',
  diamond: 'diam',
  hexagon: 'hex',
  stadium: 'stadium',
  subroutine: 'fr-rect',
  cylinder: 'cyl',
  rect_left_inv_arrow: 'odd',
  lean_right: 'lean-r',
  lean_left: 'lean-l',
  trapezoid: 'trap-b',
  inv_trapezoid: 'trap-t',
  block_arrow: 'block-arrow',
  composite: 'composite',
  space: 'space',
};

export interface Box {
  readonly w: number;
  readonly h: number;
}

/** A block's natural size: its label shift (`dy`) and, for a labelled composite, its band. */
export interface Natural extends Box {
  readonly dy: number;
  readonly band: number;
}

/** What a kind is measured and drawn from. */
export interface KindParts {
  readonly type: BlockType;
  readonly span: number;
  readonly directions: readonly string[];
  /** The label's box; absent for an unlabelled composite. */
  readonly label?: Box;
  readonly padding: number;
  readonly pads: Pads;
}

/** A block's outline in its cell, and where its label's centre is from the cell's. */
export interface Drawn {
  readonly outline: Outline;
  readonly label: Point;
}

interface Kind {
  natural(parts: KindParts): Natural;
  draw(parts: KindParts & { readonly natural: Natural; readonly cell: Box }): Drawn;
}

const NOTHING: Natural = { w: 0, h: 0, dy: 0, band: 0 };
const CENTRE: Point = { x: 0, y: 0 };

/** The label's box, which every kind but the composite has. */
const labelOf = (parts: KindParts): Box => parts.label ?? NOTHING;

const KINDS: Readonly<Record<'composite' | 'block-arrow' | 'leaf', Kind>> = {
  // D444: a labelled composite has a band above its grid, `padding` and then the label. It is
  // as wide as its label (v12's composite padding, 0); an empty one is the band and a padding.
  composite: {
    natural: ({ label, padding }) => {
      if (!label) return NOTHING;
      const band = padding + label.h;
      return { w: label.w, h: band + padding, dy: 0, band };
    },
    draw: ({ cell, label, padding }) => ({
      outline: { kind: 'rect', width: cell.w, height: cell.h, rx: 0 },
      label: label ? { x: 0, y: -cell.h / 2 + padding + label.h / 2 } : CENTRE,
    }),
  },
  'block-arrow': {
    natural: (parts) => {
      const { w, h } = blockArrowSize(
        { width: labelOf(parts).w, height: labelOf(parts).h },
        parts.padding,
        parts.directions
      );
      return { w, h, dy: 0, band: 0 };
    },
    // v12 stretched the arrow to its cell only when it spans and the cell is wider. The natural
    // size holds the polygon's reach past its body (#1193); the body is drawn without it.
    draw: (parts) => {
      const { span, cell, natural, directions, padding } = parts;
      const label = { width: labelOf(parts).w, height: labelOf(parts).h };
      const reach = 2 * blockArrowReach(directions, label, padding).x;
      const width = span > 1 && cell.w > natural.w ? cell.w - reach : natural.w - reach;
      return {
        outline: {
          kind: 'polygon',
          points: blockArrowPolygon({ directions, label, padding, width }),
        },
        label: CENTRE,
      };
    },
  },
  leaf: {
    natural: (parts) => {
      const { w, h, dy } = leafSize(
        leafOf(parts.type),
        labelOf(parts).w,
        labelOf(parts).h,
        parts.pads
      );
      return { w, h, dy, band: 0 };
    },
    // The shapes that fill their cell are at least their own size, as v12's `rect` drew.
    draw: ({ type, cell, natural, pads }) => {
      const shape = leafOf(type);
      const keep = keepsSize(shape);
      return {
        outline: leafOutline({
          shape,
          width: keep ? natural.w : Math.max(natural.w, cell.w),
          height: keep ? natural.h : Math.max(natural.h, cell.h),
          pads,
          rx: type === 'round' ? BLOCK_METRICS.roundRadius : 0,
        }),
        label: { x: 0, y: natural.dy },
      };
    },
  },
};

/** A leaf type's flowchart shape. */
const leafOf = (type: BlockType): LeafShape => SHAPE_OF[type] as LeafShape;

/** The kind a block of `type` is measured and drawn as (spaces have none). */
export function kindOf(type: Exclude<BlockType, 'space'>): Kind {
  if (isComposite({ type })) return KINDS.composite;
  return SHAPE_OF[type] === 'block-arrow' ? KINDS['block-arrow'] : KINDS.leaf;
}
