/**
 * Block's leaf shapes: which of the shared shapes (`@mermaid-js/shared/shapes/*`: sizes from the
 * label box and the theme's padding) each block shape is sized as, whether it fills its grid
 * cell, and the outline edges are clipped at (`outline.ts`). The drawing is `draw.ts`'s.
 * Which block type is which shape is `../layout/kinds.ts`'s table.
 */
import {
  capRy,
  type Pads,
  type PolygonShape,
  type Shape,
  type ShapeSize,
} from '@mermaid-js/shared/shapes/kit';
import {
  circle,
  cylinder,
  diamond,
  doubleCircle,
  framedRect,
  hexagon,
  leanLeft,
  leanRight,
  odd,
  rect as box,
  stadium,
  trapezoidBottom,
  trapezoidTop,
} from '@mermaid-js/shared/shapes/basic';
import type { Outline, Point } from './outline.ts';

export type { Pads } from '@mermaid-js/shared/shapes/kit';

/** The flowchart shape names block uses. */
export type LeafShape =
  | 'rect'
  | 'stadium'
  | 'fr-rect'
  | 'cyl'
  | 'circle'
  | 'dbl-circ'
  | 'diam'
  | 'hex'
  | 'odd'
  | 'lean-r'
  | 'lean-l'
  | 'trap-b'
  | 'trap-t';

type OutlineOf = (W: number, H: number, p: Pads, rx: number) => Outline;

interface ShapeDef {
  /** The shared shape it is sized as. */
  readonly shape: Shape;
  readonly outline: OutlineOf;
  /** Keeps its own size, centred in its cell, where the others fill it (spec #521). */
  readonly keepsSize?: true;
}

const rect =
  (radius: (W: number, H: number, rx: number) => number): OutlineOf =>
  (width, height, _p, rx) => ({ kind: 'rect', width, height, rx: radius(width, height, rx) });
const square = rect(() => 0);
const ellipse: OutlineOf = (W) => ({ kind: 'ellipse', rx: W / 2, ry: W / 2 });

/** A straight-sided shape: its outline is the shared shape's polygon. */
const polygon = (shape: PolygonShape): ShapeDef => ({
  shape,
  outline: (W, H, p) => {
    const coords = shape.points(W, H, p);
    const points: Point[] = [];
    for (let i = 0; i + 1 < coords.length; i += 2)
      points.push({ x: coords[i]!, y: coords[i + 1]! });
    return { kind: 'polygon', points };
  },
});

const SHAPE_DEFS: Readonly<Record<LeafShape, ShapeDef>> = {
  // v12 drew the square and round blocks as its `rect`, round with its corner radius.
  rect: { shape: box, outline: rect((W, H, rx) => Math.min(rx, W / 2, H / 2)) },
  stadium: { shape: stadium, outline: rect((W, H) => Math.min(H / 2, W / 2)) },
  'fr-rect': { shape: framedRect, outline: square },
  cyl: {
    shape: cylinder,
    outline: (width, height) => ({ kind: 'cylinder', width, height, ry: capRy(width) }),
  },
  circle: { shape: circle, keepsSize: true, outline: ellipse },
  'dbl-circ': { shape: doubleCircle, keepsSize: true, outline: ellipse },
  diam: { ...polygon(diamond), keepsSize: true },
  hex: polygon(hexagon),
  odd: polygon(odd),
  'lean-r': polygon(leanRight),
  'lean-l': polygon(leanLeft),
  'trap-b': polygon(trapezoidBottom),
  'trap-t': polygon(trapezoidTop),
};

/** The natural size of `shape` about a label box `tw × th`. */
export const leafSize = (shape: LeafShape, tw: number, th: number, p: Pads): ShapeSize =>
  SHAPE_DEFS[shape].shape.size(tw, th, p);

/** Whether `shape` keeps its natural size in its cell (circle, double circle, diamond). */
export const keepsSize = (shape: LeafShape): boolean => SHAPE_DEFS[shape].keepsSize === true;

/** What {@link leafOutline} draws. */
export interface LeafParts {
  readonly shape: LeafShape;
  /** The drawn size. */
  readonly width: number;
  readonly height: number;
  readonly pads: Pads;
  /** The corner radius, where the shape has corners. */
  readonly rx: number;
}

/** The outline of a leaf shape. */
export const leafOutline = ({ shape, width, height, pads, rx }: LeafParts): Outline =>
  SHAPE_DEFS[shape].outline(width, height, pads, rx);
