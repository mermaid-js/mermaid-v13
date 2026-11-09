/**
 * Block's leaf shapes (D446): a local copy of the flowchart shapes block draws
 * (`diagram-flowchart/src/render/shapes.ts`: sizes from the label box and the theme's padding,
 * and the outline), as class, state and mindmap keep theirs. Only the geometry half is here:
 * the size, whether the shape fills its grid cell, and the outline edges are clipped at. The
 * drawing is #556's.
 *
 * Block's types map onto the flowchart names as v12's `renderHelpers.ts` mapped them onto its
 * shapes: square and `na` are `rect`, and round is `rect` with v12's corner radius (it sized as
 * the square, not as flowchart's rounded rectangle).
 */
import type { Theme } from '@mermaid-js/core/theme';
import type { BlockType } from '../model.ts';
import type { Outline, Point } from './outline.ts';

/** Padding added across (`x`) and down (`y`). */
export interface PadXY {
  readonly x: number;
  readonly y: number;
}

/** Room around the label, from the theme's padding variables (D152) and `block.padding`. */
export interface Pads {
  /** `nodePaddingX` / `nodePaddingY`, per side. */
  readonly node: PadXY;
  /** `block.padding`: the diamond uses it in every theme. */
  readonly pad: number;
  /** `stadiumPaddingX` / `stadiumPaddingY`, totals. */
  readonly stadium: PadXY;
  /** `hexagonPaddingX` (to the width) / `hexagonPaddingY` (to the height), totals. */
  readonly hexagon: PadXY;
  /** `hexagonSlant`: each pointed end of a hexagon is its height over this. */
  readonly hexagonSlant: number;
  /** `subroutinePadding*`, `cylinderPadding*`, `leanPadding*`, `oddPadding*`: totals. */
  readonly subroutine: PadXY;
  readonly cylinder: PadXY;
  readonly lean: PadXY;
  readonly odd: PadXY;
  /** `doubleCircleGap` (between the rings) / `doubleCirclePadding` (label to inner ring). */
  readonly ringGap: number;
  readonly ringPad: number;
  /** `circlePadding` (added to the label diagonal) / `circleMinDiameter`. */
  readonly circlePad: number;
  readonly circleMin: number;
}

/** A hexagon slant of 0 would put its points at infinity (flowchart's `MIN_SLANT`). */
const MIN_SLANT = 1;

/** The theme's shape padding (the rows block shares with flowchart), over `block.padding`. */
export function padsOf(theme: Theme, pad: number): Pads {
  const padOf = (name: string): number => theme.padding(name, pad);
  return {
    node: { x: padOf('nodePaddingX'), y: padOf('nodePaddingY') },
    pad,
    stadium: { x: padOf('stadiumPaddingX'), y: padOf('stadiumPaddingY') },
    hexagon: { x: padOf('hexagonPaddingX'), y: padOf('hexagonPaddingY') },
    hexagonSlant: Math.max(theme.number('hexagonSlant'), MIN_SLANT),
    subroutine: { x: padOf('subroutinePaddingX'), y: padOf('subroutinePaddingY') },
    cylinder: { x: padOf('cylinderPaddingX'), y: padOf('cylinderPaddingY') },
    lean: { x: padOf('leanPaddingX'), y: padOf('leanPaddingY') },
    odd: { x: padOf('oddPaddingX'), y: padOf('oddPaddingY') },
    ringGap: theme.number('doubleCircleGap'),
    ringPad: padOf('doubleCirclePadding'),
    circlePad: padOf('circlePadding'),
    circleMin: theme.number('circleMinDiameter'),
  };
}

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

export interface ShapeSize {
  readonly w: number;
  readonly h: number;
  /** Shift of the label from the shape's centre. */
  readonly dy: number;
}

type Sizer = (tw: number, th: number, p: Pads) => ShapeSize;
type OutlineOf = (W: number, H: number, p: Pads, rx: number) => Outline;

interface ShapeDef {
  readonly size: Sizer;
  readonly outline: OutlineOf;
  /** Keeps its own size, centred in its cell, where the others fill it (spec #521). */
  readonly keepsSize?: true;
}

const box: Sizer = (tw, th, p) => ({
  w: Math.max(tw, 12) + 2 * p.node.x,
  h: th + 2 * p.node.y,
  dy: 0,
});

// A shape with its own total padding (v12's per-shape `labelPaddingX/Y`): `ex` wider and
// `exH` × its height more for slanted sides. `each` applies the padding on each side instead.
const padded =
  (pick: (p: Pads) => PadXY, ex = 0, exH = 0, each = false): Sizer =>
  (tw, th, p) => {
    const { x, y } = pick(p);
    const k = each ? 2 : 1;
    const h = th + k * y;
    return { w: tw + k * x + ex + exH * h, h, dy: 0 };
  };
const lean = padded((p) => p.lean, 0, 0.5);

const capRy = (W: number): number => Math.min(12, Math.max(6, W / 14));

// v12 cylinder: the padding plus a cap height on top of the label (the body between the caps'
// front edges is label + padding + ry).
function cylinderSize(tw: number, th: number, p: Pads): ShapeSize {
  const w = Math.max(tw + p.cylinder.x, 56);
  const ry = capRy(w);
  return { w, h: th + p.cylinder.y + 3 * ry, dy: ry / 2 };
}

const rect =
  (radius: (W: number, H: number, rx: number) => number): OutlineOf =>
  (width, height, _p, rx) => ({ kind: 'rect', width, height, rx: radius(width, height, rx) });
const square = rect(() => 0);
const ellipse: OutlineOf = (W) => ({ kind: 'ellipse', rx: W / 2, ry: W / 2 });

/** Flat coordinates `[x0, y0, x1, y1, …]` as points. */
const polygon = (coords: readonly number[]): Outline => {
  const points: Point[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) points.push({ x: coords[i]!, y: coords[i + 1]! });
  return { kind: 'polygon', points };
};

/**
 * A box with some corners cut in by a quarter of its height: the lean and trapezoid shapes.
 * Corners go clockwise from the top left.
 */
function slanted(tl: boolean, tr: boolean, br: boolean, bl: boolean, size = lean): ShapeDef {
  return {
    size,
    outline: (W, H) => {
      const s = H / 4;
      const l = -W / 2;
      const r = W / 2;
      return polygon([
        tl ? l + s : l,
        -H / 2,
        tr ? r - s : r,
        -H / 2,
        br ? r - s : r,
        H / 2,
        bl ? l + s : l,
        H / 2,
      ]);
    },
  };
}

const S: Readonly<Record<LeafShape, ShapeDef>> = {
  // v12 drew the square and round blocks as its `rect`, round with its corner radius.
  rect: { size: box, outline: rect((W, H, rx) => Math.min(rx, W / 2, H / 2)) },
  stadium: {
    // v12 stadiumDimensions: room for the label inside the caps, at least 1.5 × the height.
    size: (tw, th, p) => {
      const { x, y } = p.stadium;
      const h = th + y;
      const cap = Math.sqrt(Math.max(0, h * h - th * th));
      return { w: Math.max(tw + h / 4 + x, 1.5 * h, tw + x + h - cap), h, dy: 0 };
    },
    outline: rect((W, H) => Math.min(H / 2, W / 2)),
  },
  // v12 subroutine: the padding inside the two 8px frames.
  'fr-rect': { size: padded((p) => p.subroutine, 16), outline: square },
  cyl: {
    size: cylinderSize,
    outline: (width, height) => ({ kind: 'cylinder', width, height, ry: capRy(width) }),
  },
  circle: {
    keepsSize: true,
    size: (tw, th, p) => {
      const d = Math.max(Math.hypot(tw, th) + p.circlePad, p.circleMin);
      return { w: d, h: d, dy: 0 };
    },
    outline: ellipse,
  },
  'dbl-circ': {
    keepsSize: true,
    // v12: the inner ring clears the label diagonal by ringPad, the outer ring is ringGap out.
    size: (tw, th, p) => {
      const d = Math.hypot(tw, th) + 2 * (p.ringPad + p.ringGap);
      return { w: d, h: d, dy: 0 };
    },
    outline: ellipse,
  },
  diam: {
    keepsSize: true,
    // v12 question: a square rhombus, side = label width + label height + 2 × padding.
    size: (tw, th, p) => {
      const s = tw + th + 2 * p.pad;
      return { w: s, h: s, dy: 0 };
    },
    outline: (W, H) => polygon([0, -H / 2, W / 2, 0, 0, H / 2, -W / 2, 0]),
  },
  hex: {
    // v12 hexagon with the axes corrected (D151): X padding to the width, Y to the height.
    size: (tw, th, p) => {
      const h = th + p.hexagon.y;
      return { w: tw + 2 * (h / p.hexagonSlant) + p.hexagon.x, h, dy: 0 };
    },
    outline: (W, H, p) => {
      const m = H / p.hexagonSlant;
      const x = W / 2;
      const y = H / 2;
      return polygon([-x + m, -y, x - m, -y, x, 0, x - m, y, -x + m, y, -x, 0]);
    },
  },
  // v12 rect_left_inv_arrow.
  odd: {
    size: padded((p) => p.odd, 0, 0.25),
    outline: (W, H) => {
      const x = W / 2;
      const y = H / 2;
      return polygon([-x, -y, x, -y, x, y, -x, y, -x + H / 4, 0]);
    },
  },
  'lean-r': slanted(true, false, true, false),
  'lean-l': slanted(false, true, false, true),
  'trap-b': slanted(true, true, false, false),
  // v12 inv_trapezoid pads each side.
  'trap-t': slanted(
    false,
    false,
    true,
    true,
    padded((p) => p.lean, 0, 0.5, true)
  ),
};

/** The shape a leaf block of `type` is drawn as (v12 `getNodeFromBlock`). */
export function leafShape(type: BlockType): LeafShape {
  switch (type) {
    case 'circle':
      return 'circle';
    case 'doublecircle':
      return 'dbl-circ';
    case 'diamond':
      return 'diam';
    case 'hexagon':
      return 'hex';
    case 'stadium':
      return 'stadium';
    case 'subroutine':
      return 'fr-rect';
    case 'cylinder':
      return 'cyl';
    case 'rect_left_inv_arrow':
      return 'odd';
    case 'lean_right':
      return 'lean-r';
    case 'lean_left':
      return 'lean-l';
    case 'trapezoid':
      return 'trap-b';
    case 'inv_trapezoid':
      return 'trap-t';
    // Square, round and `na`; composites, spaces and block arrows have shapes of their own.
    case 'square':
    case 'round':
    case 'na':
    case 'composite':
    case 'space':
    case 'block_arrow':
      return 'rect';
  }
}

/** The natural size of `shape` about a label box `tw × th`. */
export const leafSize = (shape: LeafShape, tw: number, th: number, p: Pads): ShapeSize =>
  S[shape].size(tw, th, p);

/** Whether `shape` keeps its natural size in its cell (circle, double circle, diamond). */
export const keepsSize = (shape: LeafShape): boolean => S[shape].keepsSize === true;

/** The outline of `shape` drawn `W × H`, corners rounded by `rx` where the shape has corners. */
export const leafOutline = (shape: LeafShape, W: number, H: number, p: Pads, rx: number): Outline =>
  S[shape].outline(W, H, p, rx);
