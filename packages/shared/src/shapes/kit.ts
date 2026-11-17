// What node shapes are built from: the padding a shape is sized with, the shape definition, and
// the sizers, outline helpers and path builders several shapes (and the diagrams that draw a
// shape their own way) share. Ported from Pele's src/svg/shapes.ts @ 3a2f075
// (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano), with v12's shape names and the
// theme's padding and radius tokens. Every shape goes through `w.outline` (D302): the outline as
// `node`, inner lines as `divider`, a filled piece inside a shape as `part`, small dots as `mark`.
// cspell:ignore kepano
import type { Attrs, OutlineRole, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { Theme } from '@mermaid-js/core/theme';

/** Padding added across (`x`) and down (`y`). */
export interface PadXY {
  readonly x: number;
  readonly y: number;
}

/** Room around the label, from the theme's padding variables (D152) and the diagram's `padding`. */
export interface Pads {
  /** `nodePaddingX` / `nodePaddingY`, per side: the rectangle and the shapes that share it. */
  readonly node: PadXY;
  /** Corner radius of rounded shapes. */
  readonly r: number;
  /** The diagram's `padding`: the diamond and rounded rectangle use it in every theme. */
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

/** The smallest `hexagonSlant` drawn: a slant of 0 would put a hexagon's points at infinity. */
const MIN_SLANT = 1;

/** The theme's shape padding, over the diagram's own `padding` (`flowchart.padding`, `block.padding`). */
export function themePads(theme: Theme, pad: number): Pads {
  const padOf = (name: string): number => theme.padding(name, pad);
  const xy = (shape: string): PadXY => ({
    x: padOf(`${shape}PaddingX`),
    y: padOf(`${shape}PaddingY`),
  });
  return {
    node: xy('node'),
    r: theme.number('radius'),
    pad,
    stadium: xy('stadium'),
    hexagon: xy('hexagon'),
    hexagonSlant: Math.max(theme.number('hexagonSlant'), MIN_SLANT),
    subroutine: xy('subroutine'),
    cylinder: xy('cylinder'),
    lean: xy('lean'),
    odd: xy('odd'),
    ringGap: theme.number('doubleCircleGap'),
    ringPad: padOf('doubleCirclePadding'),
    circlePad: padOf('circlePadding'),
    circleMin: theme.number('circleMinDiameter'),
  };
}

export interface ShapeSize {
  readonly w: number;
  readonly h: number;
  /** Shift of the label from the shape's centre. */
  readonly dy: number;
}

/** A shape's size about a label box `tw` × `th`. */
export type Sizer = (tw: number, th: number, p: Pads) => ShapeSize;
/**
 * Draws a `W` × `H` shape centred on the origin: `a` paints its outline, `line` its inner lines.
 */
export type Drawer = (w: SvgWriter, W: number, H: number, a: Attrs, line: Attrs, p: Pads) => void;
/** Distance from the box to the outline on a side (0 top, 1 right, 2 bottom, 3 left), `t` along the side. */
export type Inset = (W: number, H: number, side: number, t: number, p: Pads) => number;
/** How much of a side edges may spread along (top/bottom, or left/right when sideways). */
export type Span = (W: number, H: number, sideways: boolean) => number;

/**
 * One shape. A diagram imports the shapes it draws and keeps its own table of them, so it loads
 * no shape it does not draw.
 */
export interface Shape {
  readonly size: Sizer;
  readonly draw: Drawer;
  readonly inset?: Inset;
  readonly span?: Span;
  /**
   * A straight-sided shape's outline as flat coordinates `[x0, y0, x1, y1, …]` about its centre,
   * clockwise: what `draw` writes, for a diagram that clips edges at the outline itself.
   */
  readonly points?: (W: number, H: number, p: Pads) => number[];
  readonly noLabel?: true;
  /** Draws no fill of its own, so text keeps the theme ink. */
  readonly bare?: true;
  /**
   * Its `line` paint must be a colour, not the gradient (D182, D185): the drawer fills with
   * `line.stroke` (the dots, the fork bar: v12 neo fills nothing with the gradient), or draws a
   * one-segment line, whose zero-width or zero-height box a bounding-box gradient can't paint
   * (the lin-doc and lin-rect rules, the div-rect and browser bars).
   */
  readonly plain?: true;
}

/** A shape whose outline is a polygon. */
export type PolygonShape = Shape & Required<Pick<Shape, 'points'>>;

/** Kept clear at each end of a flat side when edges spread along it. */
export const CORNER = 12;
/** A framed rectangle's two frame lines stand this far inside its sides. */
export const FRAME = 8;
export const NONE: Attrs = { fill: 'none', stroke: 'none' };

export const flat: Span = (W, H, s) => (s ? H : W) - 2 * CORNER;
export const flatAcross =
  (cut: (H: number) => number): Span =>
  (W, H, s) =>
    s ? 0 : W - 2 * cut(H) - 2 * CORNER;
export const bulge = (t: number, half: number, depth: number): number => {
  const k = Math.min(1, Math.abs(t) / half);
  return depth * (1 - Math.sqrt(1 - k * k));
};
export const roundInset: Inset = (W, H, side, t) =>
  side & 1 ? bulge(t, H / 2, W / 2) : bulge(t, W / 2, H / 2);
export const roundSpan: Span = (W, H, s) => (s ? H : W) * 0.6;
/** A cylinder's cap radius for its width. */
export const capRy = (W: number): number => Math.min(12, Math.max(6, W / 14));
/** A horizontal cylinder's cap radius for its height. */
export const queueRx = (H: number): number => Math.min(12, H / 4);
export const capInset: Inset = (W, _H, side, t) => (side & 1 ? 0 : bulge(t, W / 2, capRy(W)));

export const fixed =
  (w: number, h: number): Sizer =>
  () => ({ w, h, dy: 0 });
export const box: Sizer = (tw, th, p) => ({
  w: Math.max(tw, 12) + 2 * p.node.x,
  h: th + 2 * p.node.y,
  dy: 0,
});
/** A box `ex` wider and `ey` taller than the label box, label shifted by `dy`. */
export const grown =
  (ex: number, ey: number, dy = 0, exH = 0): Sizer =>
  (tw, th, p) => {
    const h = th + 2 * p.node.y + ey;
    return { w: tw + 2 * p.node.x + ex + exH * h, h, dy };
  };

/**
 * A shape with its own total padding (v12's per-shape `labelPaddingX/Y`): `ex` wider and
 * `exH` × its height more for slanted sides. `each` applies the padding on each side instead.
 */
export const padded =
  (pick: (p: Pads) => PadXY, ex = 0, exH = 0, each = false): Sizer =>
  (tw, th, p) => {
    const { x, y } = pick(p);
    const k = each ? 2 : 1;
    const h = th + k * y;
    return { w: tw + k * x + ex + exH * h, h, dy: 0 };
  };

/**
 * v12 cylinder: the padding plus a cap height on top of the label (the body between the caps'
 * front edges is label + padding + ry), `extra` more for the lined cylinder's second rim. It is
 * at least `least` wide.
 */
export function cylinderSize(tw: number, th: number, pad: PadXY, extra = 0, least = 56): ShapeSize {
  const w = Math.max(tw + pad.x, least);
  const ry = capRy(w);
  return { w, h: th + pad.y + 3 * ry + extra, dy: ry / 2 + extra / 2 };
}

/** A rectangle by its top left corner and size, corners rounded by `rx`. */
export interface RectAt {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rx?: number;
}

export function drawRect(w: SvgWriter, at: RectAt, a: Attrs): void {
  w.outline('node', 'rect', {
    x: at.x,
    y: at.y,
    width: at.width,
    height: at.height,
    rx: at.rx,
    ...a,
  });
}
export const centred = (w: SvgWriter, W: number, H: number, a: Attrs, rx?: number): void =>
  drawRect(w, { x: -W / 2, y: -H / 2, width: W, height: H, rx }, a);
export const poly = (w: SvgWriter, points: number[], a: Attrs): void =>
  w.outline('node', 'polygon', { points, ...a });
export const drawCircle = (
  w: SvgWriter,
  r: number,
  a: Attrs,
  role: OutlineRole = 'node',
  cx?: number,
  cy?: number
): void => w.outline(role, 'circle', { cx, cy, r, ...a });
/** A double circle's inner ring, of radius `r`. */
export const ring = (w: SvgWriter, r: number, line: Attrs): void =>
  drawCircle(w, r, { ...line, fill: 'none' }, 'divider');

/** Line segments [x0, y0, x1, y1, …] as one path's data, each pair of points a separate stroke. */
export function segments(w: SvgWriter, coords: readonly number[]): PathData {
  const b = w.path();
  for (let i = 0; i + 3 < coords.length; i += 4)
    b.moveTo(coords[i]!, coords[i + 1]!).lineTo(coords[i + 2]!, coords[i + 3]!);
  return b.done();
}
/** {@link segments} as one `divider`. */
export function lines(w: SvgWriter, coords: readonly number[], a: Attrs): void {
  w.outline('divider', 'path', { d: segments(w, coords), ...a, fill: 'none' });
}
/** A framed rectangle's two frame lines, {@link FRAME} inside each side of a `W` × `H` box. */
export function frameLines(w: SvgWriter, W: number, H: number, line: Attrs): void {
  const x = W / 2 - FRAME;
  lines(w, [-x, -H / 2, -x, H / 2, x, -H / 2, x, H / 2], line);
}

/**
 * A document's wave: its line is `depth` above the box bottom, and each half's control point
 * `control` off that line.
 */
export const WAVE = { depth: 10, control: 12 } as const;
/** A lined shape's rule stands this far inside its left side. */
export const RULE = 8;

/** A rectangle whose bottom is a wave. */
export function wave(w: SvgWriter, W: number, H: number, a: Attrs): void {
  const x = W / 2;
  const base = H / 2 - WAVE.depth;
  const q = W / 4;
  const d = w
    .path()
    .moveTo(-x, -H / 2)
    .lineTo(x, -H / 2)
    .lineTo(x, base)
    .quadTo(x - q, base - WAVE.control, 0, base)
    .quadTo(-q, base + WAVE.control, -x, base)
    .close()
    .done();
  w.outline('node', 'path', { d, ...a });
}

/**
 * A cylinder's body between its caps' centres (`left`…`right` across, `top`…`bottom` down) and
 * the caps' radii. Upright, the caps are above `top` and below `bottom`, `rx` half the width; on
 * its side (the queue), they are left of `left` and right of `right`, `ry` half the height.
 */
export interface Barrel {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly rx: number;
  readonly ry: number;
}

/** An upright cylinder's outline: the body with both caps. */
export const cylinderPath = (
  w: SvgWriter,
  { left, right, top, bottom, rx, ry }: Barrel
): PathData =>
  w
    .path()
    .moveTo(left, top)
    .arcTo(rx, ry, 0, false, true, right, top)
    .lineTo(right, bottom)
    .arcTo(rx, ry, 0, false, true, left, bottom)
    .close()
    .done();

/** The front of an upright cylinder's top cap, and with `extra` a second rim that far below it. */
export function cylinderRim(
  w: SvgWriter,
  { left, right, top, rx, ry }: Barrel,
  extra = 0
): PathData {
  const b = w.path().moveTo(left, top).arcTo(rx, ry, 0, false, false, right, top);
  if (extra) b.moveTo(left, top + extra).arcTo(rx, ry, 0, false, false, right, top + extra);
  return b.done();
}

/** A cylinder on its side: the body with both caps. */
export const queuePath = (w: SvgWriter, { left, right, top, bottom, rx, ry }: Barrel): PathData =>
  w
    .path()
    .moveTo(left, top)
    .lineTo(right, top)
    .arcTo(rx, ry, 0, false, true, right, bottom)
    .lineTo(left, bottom)
    .arcTo(rx, ry, 0, false, true, left, top)
    .close()
    .done();

/** The inner side of a queue's right cap. */
export const queueRim = (w: SvgWriter, { right, top, bottom, rx, ry }: Barrel): PathData =>
  w.path().moveTo(right, top).arcTo(rx, ry, 0, false, false, right, bottom).done();

/**
 * The person figure, which flowchart's `person` shape and C4's person share: a head over a body
 * in c4model.com's proportions (#683, as v12's fix mermaid-js/mermaid#8322). The head's radius is HEAD × the body's width, held between HEAD_MIN
 * and HEAD_MAX (a body widened by a long label keeps a person-sized head), and overlaps the body
 * by OVERLAP × itself; the body is at least BODY × its width tall. The label is centred on the
 * part of the body the head does not cover, one head radius below the shape's centre.
 */
const HEAD = 0.23;
const HEAD_MIN = 16;
const HEAD_MAX = 80;
const OVERLAP = 0.27;
const BODY = 0.6;

/** The head's radius for a body `W` wide. */
export const personHead = (W: number): number => Math.min(HEAD_MAX, Math.max(HEAD_MIN, W * HEAD));

/** How far below the figure's top its body starts, for a head of radius `r`. */
export const personNeck = (r: number): number => 2 * r - r * OVERLAP;

/** The figure's height around a padded label `W` wide and `h` high, and the label's shift. */
export function personSize(W: number, h: number): { h: number; dy: number } {
  const r = personHead(W);
  const overlap = r * OVERLAP;
  const body = Math.max(overlap + h, W * BODY);
  return { h: body + 2 * r - overlap, dy: r };
}

/** The head's radius and the body's top (from the centre) of a figure `W` × `H`. */
export function personFigure(W: number, H: number): { r: number; bodyTop: number } {
  const r = personHead(W);
  return { r, bodyTop: -H / 2 + 2 * r - r * OVERLAP };
}
