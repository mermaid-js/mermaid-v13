/**
 * The block arrow (`id<["label"]>(right, down)`), v12's
 * `rendering-util/rendering-elements/shapes/blockArrow.ts` at fa796a943 (D446): its point sets, its natural size, and its outline
 * as a polygon about the block's centre. v13 had no block arrow before; the drawing is #556's.
 *
 * The point sets are v12's: one factory per set of directions (`x` is `right` and `left`, `y` is
 * `up` and `down`, repeats count once), in v12's frame (x right from the left end, y up from the
 * bottom: `insertPolygonShape` moved them by `(−w/2, h/2)`); no direction is one point, which
 * draws nothing. `padding` is the shape's padding, the block's `block.padding`.
 */
import type { Point } from './outline.ts';

/** A direction as v12's grammar takes it (`DIR`), trimmed (D445). */
export type ArrowDirection = 'right' | 'left' | 'up' | 'down' | 'x' | 'y';

/** A side a block arrow points to: `x` and `y` expanded. */
export type ArrowSide = Exclude<ArrowDirection, 'x' | 'y'>;
interface ArrowMetrics {
  height: number;
  midpoint: number;
  padding: number;
  width: number;
}

type ArrowPointsFactory = (metrics: ArrowMetrics) => Point[];

const DIRECTION_ORDER: ArrowSide[] = ['right', 'left', 'up', 'down'];
const POINT_KEY = 'point';

/**
 * The sides `directions` point to, each once (`x` is `right` and `left`, `y` is `up` and
 * `down`); any other text points nowhere. The SVG polygon and the text box's arrowheads read it.
 */
export const arrowSides = (directions: readonly string[]): Set<ArrowSide> => {
  const uniqueDirections = new Set<ArrowSide>();

  for (const direction of directions) {
    switch (direction) {
      case 'x':
        uniqueDirections.add('right');
        uniqueDirections.add('left');
        break;
      case 'y':
        uniqueDirections.add('up');
        uniqueDirections.add('down');
        break;
      case 'right':
      case 'left':
      case 'up':
      case 'down':
        uniqueDirections.add(direction);
        break;
      // v12 added any other text too, which then matched no factory (the point fallback).
      default:
        break;
    }
  }

  return uniqueDirections;
};

const getDirectionKey = (directions: Set<ArrowSide>) =>
  DIRECTION_ORDER.filter((direction) => directions.has(direction)).join('|') || POINT_KEY;

const arrowPointFactories = /* @__PURE__ */ new Map<string, ArrowPointsFactory>([
  [
    'right|left|up|down',
    ({ height, midpoint, padding, width }) => [
      { x: 0, y: 0 },
      { x: midpoint, y: 0 },
      { x: width / 2, y: 2 * padding },
      { x: width - midpoint, y: 0 },
      { x: width, y: 0 },
      { x: width, y: -height / 3 },
      { x: width + 2 * padding, y: -height / 2 },
      { x: width, y: (-2 * height) / 3 },
      { x: width, y: -height },
      { x: width - midpoint, y: -height },
      { x: width / 2, y: -height - 2 * padding },
      { x: midpoint, y: -height },
      { x: 0, y: -height },
      { x: 0, y: (-2 * height) / 3 },
      { x: -2 * padding, y: -height / 2 },
      { x: 0, y: -height / 3 },
    ],
  ],
  [
    'right|left|up',
    ({ height, midpoint, width }) => [
      { x: midpoint, y: 0 },
      { x: width - midpoint, y: 0 },
      { x: width, y: -height / 2 },
      { x: width - midpoint, y: -height },
      { x: midpoint, y: -height },
      { x: 0, y: -height / 2 },
    ],
  ],
  [
    'right|left|down',
    ({ height, midpoint, width }) => [
      { x: 0, y: 0 },
      { x: midpoint, y: -height },
      { x: width - midpoint, y: -height },
      { x: width, y: 0 },
    ],
  ],
  [
    'right|up|down',
    ({ height, midpoint, width }) => [
      { x: 0, y: 0 },
      { x: width, y: -midpoint },
      { x: width, y: -height + midpoint },
      { x: 0, y: -height },
    ],
  ],
  [
    'left|up|down',
    ({ height, midpoint, width }) => [
      { x: width, y: 0 },
      { x: 0, y: -midpoint },
      { x: 0, y: -height + midpoint },
      { x: width, y: -height },
    ],
  ],
  [
    'right|left',
    ({ height, midpoint, padding, width }) => [
      { x: midpoint, y: 0 },
      { x: midpoint, y: -padding },
      { x: width - midpoint, y: -padding },
      { x: width - midpoint, y: 0 },
      { x: width, y: -height / 2 },
      { x: width - midpoint, y: -height },
      { x: width - midpoint, y: -height + padding },
      { x: midpoint, y: -height + padding },
      { x: midpoint, y: -height },
      { x: 0, y: -height / 2 },
    ],
  ],
  [
    'up|down',
    ({ height, midpoint, padding, width }) => [
      { x: width / 2, y: 0 },
      { x: 0, y: -padding },
      { x: midpoint, y: -padding },
      { x: midpoint, y: -height + padding },
      { x: 0, y: -height + padding },
      { x: width / 2, y: -height },
      { x: width, y: -height + padding },
      { x: width - midpoint, y: -height + padding },
      { x: width - midpoint, y: -padding },
      { x: width, y: -padding },
    ],
  ],
  [
    'right|up',
    ({ height, midpoint, width }) => [
      { x: 0, y: 0 },
      { x: width, y: -midpoint },
      { x: 0, y: -height },
    ],
  ],
  [
    'right|down',
    ({ height, width }) => [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: 0, y: -height },
    ],
  ],
  [
    'left|up',
    ({ height, midpoint, width }) => [
      { x: width, y: 0 },
      { x: 0, y: -midpoint },
      { x: width, y: -height },
    ],
  ],
  [
    'left|down',
    ({ height, width }) => [
      { x: width, y: 0 },
      { x: 0, y: 0 },
      { x: width, y: -height },
    ],
  ],
  [
    'right',
    ({ height, midpoint, padding, width }) => [
      { x: midpoint, y: -padding },
      { x: midpoint, y: -padding },
      { x: width - midpoint, y: -padding },
      { x: width - midpoint, y: 0 },
      { x: width, y: -height / 2 },
      { x: width - midpoint, y: -height },
      { x: width - midpoint, y: -height + padding },
      { x: midpoint, y: -height + padding },
      { x: midpoint, y: -height + padding },
    ],
  ],
  [
    'left',
    ({ height, midpoint, padding, width }) => [
      { x: midpoint, y: 0 },
      { x: midpoint, y: -padding },
      { x: width - midpoint, y: -padding },
      { x: width - midpoint, y: -height + padding },
      { x: midpoint, y: -height + padding },
      { x: midpoint, y: -height },
      { x: 0, y: -height / 2 },
    ],
  ],
  [
    'up',
    ({ height, midpoint, padding, width }) => [
      { x: midpoint, y: -padding },
      { x: midpoint, y: -height + padding },
      { x: 0, y: -height + padding },
      { x: width / 2, y: -height },
      { x: width, y: -height + padding },
      { x: width - midpoint, y: -height + padding },
      { x: width - midpoint, y: -padding },
    ],
  ],
  [
    'down',
    ({ height, midpoint, padding, width }) => [
      { x: width / 2, y: 0 },
      { x: 0, y: -padding },
      { x: midpoint, y: -padding },
      { x: midpoint, y: -height + padding },
      { x: width - midpoint, y: -height + padding },
      { x: width - midpoint, y: -padding },
      { x: width, y: -padding },
    ],
  ],
  [POINT_KEY, () => [{ x: 0, y: 0 }]],
]);

/**
 * v12's arrow metrics about a label box: half the node padding as the arrow's `padding`, the
 * label's height plus twice the node padding as its height, the midpoint half that, and by
 * default the label's width plus the height and the node padding as its width (`getArrowPoints`
 * and `block_arrow` derived the same numbers each their own way).
 */
function arrowMetrics(
  bbox: { readonly width: number; readonly height: number },
  nodePadding: number,
  totalWidth?: number
): ArrowMetrics {
  const padding = nodePadding / 2;
  const height = bbox.height + 4 * padding;
  const midpoint = height / 2;
  return {
    height,
    midpoint,
    padding,
    width: totalWidth ?? bbox.width + 2 * midpoint + 2 * padding,
  };
}

/**
 * v12 `getArrowPoints`: the polygon for `directions` around a label box `bbox`, in v12's frame,
 * `totalWidth` wide (by default the natural width).
 */
export const getArrowPoints = (
  duplicatedDirections: readonly string[],
  bbox: { readonly width: number; readonly height: number },
  node: { readonly padding?: number },
  totalWidth?: number
): Point[] => {
  const key = getDirectionKey(arrowSides(duplicatedDirections));
  const pointFactory = arrowPointFactories.get(key) ?? arrowPointFactories.get(POINT_KEY)!;
  return pointFactory(arrowMetrics(bbox, node.padding ?? 0, totalWidth));
};

/** v12 `block_arrow`'s natural size about a label box, with the block padding. */
export function blockArrowSize(
  label: { readonly width: number; readonly height: number },
  padding: number
): { w: number; h: number } {
  const { width, height } = arrowMetrics(label, padding);
  return { w: width, h: height };
}

/** What {@link blockArrowPolygon} draws. */
export interface ArrowParts {
  readonly directions: readonly string[];
  /** The label's box. */
  readonly label: { readonly width: number; readonly height: number };
  /** The block padding. */
  readonly padding: number;
  /**
   * The width: v12 stretched the arrow to its cell only when it spans more than one column and
   * the cell is wider; the caller decides.
   */
  readonly width: number;
}

/** The arrow's polygon about the block's centre. */
export function blockArrowPolygon({ directions, label, padding, width }: ArrowParts): Point[] {
  const { height } = arrowMetrics(label, padding, width);
  return getArrowPoints(directions, label, { padding }, width).map((p) => ({
    x: p.x - width / 2,
    y: p.y + height / 2,
  }));
}
