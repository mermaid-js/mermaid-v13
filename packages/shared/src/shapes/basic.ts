// The shapes v12's bracket syntax draws (`[ ]`, `( )`, `{ }`, `[/ /]`, …), which flowchart,
// block and agentflow share: each one's size from its label, its drawer, and how far its
// outline sits inside the layout box (so edges meet the outline, not the box). Ported from
// Pele's src/svg/shapes.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano),
// with v12's shape names and the theme's padding and radius tokens.
// cspell:ignore kepano
import type { Attrs, SvgWriter } from '@mermaid-js/core/svg';
import {
  box,
  bulge,
  capInset,
  capRy,
  centred,
  drawCircle,
  CORNER,
  cylinderPath,
  cylinderRim,
  cylinderSize,
  flat,
  flatAcross,
  frameLines,
  padded,
  poly,
  ring,
  roundInset,
  roundSpan,
  type Barrel,
  type Inset,
  type PolygonShape,
  type Shape,
  type Sizer,
} from './kit.ts';

/** v12 `rect` (`[ ]`). */
export const rect: Shape = { size: box, span: flat, draw: (w, W, H, a) => centred(w, W, H, a) };

/** v12 `roundedRect` (`( )`): the diagram's `padding` per side in every theme. */
export const rounded: Shape = {
  size: (tw, th, p) => ({ w: Math.max(tw, 12) + 2 * p.pad, h: th + 2 * p.pad, dy: 0 }),
  span: flat,
  draw: (w, W, H, a, _l, p) => centred(w, W, H, a, Math.min(p.r, H / 2)),
};

/** v12 `stadium` (`([ ])`). */
export const stadium: Shape = {
  inset: (_W, H, side, t) => (side & 1 ? bulge(t, H / 2, H / 2) : 0),
  span: (W, H, s) => (s ? H * 0.6 : W - H),
  // v12 stadiumDimensions: room for the label inside the caps, at least 1.5 × the height.
  size: (tw, th, p) => {
    const { x, y } = p.stadium;
    const h = th + y;
    const cap = Math.sqrt(Math.max(0, h * h - th * th));
    return { w: Math.max(tw + h / 4 + x, 1.5 * h, tw + x + h - cap), h, dy: 0 };
  },
  draw: (w, W, H, a) => centred(w, W, H, a, H / 2),
};

/** v12 `subroutine` (`[[ ]]`): the padding inside the two 8px frames. */
export const framedRect: Shape = {
  span: flat,
  size: /* @__PURE__ */ padded((p) => p.subroutine, 16),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    frameLines(w, W, H, line);
  },
};

/** An upright cylinder `W` × `H` about the origin, with the rim of its top cap (and `extra`'s). */
export function drawCylinder(
  w: SvgWriter,
  { W, H, extra }: { readonly W: number; readonly H: number; readonly extra: number },
  a: Attrs,
  line: Attrs
): void {
  const rx = W / 2;
  const ry = capRy(W);
  const barrel: Barrel = { left: -rx, right: rx, top: -H / 2 + ry, bottom: H / 2 - ry, rx, ry };
  w.outline('node', 'path', { d: cylinderPath(w, barrel), ...a });
  w.outline('divider', 'path', { d: cylinderRim(w, barrel, extra), ...line, fill: 'none' });
}

/** v12 `cylinder` (`[( )]`). */
export const cylinder: Shape = {
  inset: capInset,
  span: (W, H, s) => (s ? H - 2 * CORNER - 12 : W * 0.6),
  size: (tw, th, p) => cylinderSize(tw, th, p.cylinder),
  draw: (w, W, H, a, line) => drawCylinder(w, { W, H, extra: 0 }, a, line),
};

/** v12 `circle` (`(( ))`). */
export const circle: Shape = {
  inset: roundInset,
  span: roundSpan,
  size: (tw, th, p) => {
    const d = Math.max(Math.hypot(tw, th) + p.circlePad, p.circleMin);
    return { w: d, h: d, dy: 0 };
  },
  draw: (w, W, _H, a) => drawCircle(w, W / 2, a),
};

/** v12 `doublecircle` (`((( )))`). */
export const doubleCircle: Shape = {
  inset: roundInset,
  span: roundSpan,
  // v12: the inner ring clears the label diagonal by ringPad, the outer ring is ringGap out.
  size: (tw, th, p) => {
    const d = Math.hypot(tw, th) + 2 * (p.ringPad + p.ringGap);
    return { w: d, h: d, dy: 0 };
  },
  draw: (w, W, _H, a, line, p) => {
    drawCircle(w, W / 2, a);
    ring(w, Math.max(0, W / 2 - p.ringGap), line);
  },
};

/** A diamond with its points at the middle of each side. */
export const rhombusPoints = (W: number, H: number): number[] => [
  0,
  -H / 2,
  W / 2,
  0,
  0,
  H / 2,
  -W / 2,
  0,
];
export const rhombusInset: Inset = (W, H, side, t) =>
  side & 1 ? (Math.abs(t) * W) / H : (Math.abs(t) * H) / W;

/** v12 `question` (`{ }`): a square rhombus, side = label width + label height + 2 × padding. */
export const diamond: PolygonShape = {
  inset: rhombusInset,
  span: roundSpan,
  size: (tw, th, p) => {
    const s = tw + th + 2 * p.pad;
    return { w: s, h: s, dy: 0 };
  },
  points: rhombusPoints,
  draw: (w, W, H, a) => poly(w, rhombusPoints(W, H), a),
};

/** v12 `hexagon` (`{{ }}`) with the axes corrected (D151): X padding to the width, Y to the height. */
export const hexagon: PolygonShape = {
  inset: (_W, _H, side, t, p) => (side & 1 ? (2 * Math.abs(t)) / p.hexagonSlant : 0),
  span: (W, H, s) => (s ? H * 0.5 : W - H / 2 - CORNER),
  size: (tw, th, p) => {
    const h = th + p.hexagon.y;
    return { w: tw + 2 * (h / p.hexagonSlant) + p.hexagon.x, h, dy: 0 };
  },
  points: (W, H, p) => {
    const m = H / p.hexagonSlant;
    const x = W / 2;
    const y = H / 2;
    return [-x + m, -y, x - m, -y, x, 0, x - m, y, -x + m, y, -x, 0];
  },
  draw: (w, W, H, a, _l, p) => poly(w, hexagon.points(W, H, p), a),
};

/** v12 `rect_left_inv_arrow` (`> ]`). */
export const odd: PolygonShape = {
  inset: (_W, H, side) => (side === 3 ? H / 4 : 0),
  span: /* @__PURE__ */ flatAcross(() => 0),
  size: /* @__PURE__ */ padded((p) => p.odd, 0, 0.25),
  points: (W, H) => {
    const x = W / 2;
    const y = H / 2;
    return [-x, -y, x, -y, x, y, -x, y, -x + H / 4, 0];
  },
  draw: (w, W, H, a, _l, p) => poly(w, odd.points(W, H, p), a),
};

const leanInset: Inset = (_W, H, side) => (side & 1 ? H / 8 : 0);
const lean: Sizer = /* @__PURE__ */ padded((p) => p.lean, 0, 0.5);

/** Which corners of a box are cut in, clockwise from the top left. */
type Cuts = readonly [tl: boolean, tr: boolean, br: boolean, bl: boolean];

/** A box with some corners cut in by a quarter of its height: the lean and trapezoid shapes. */
function slanted([tl, tr, br, bl]: Cuts, size = lean): PolygonShape {
  const points = (W: number, H: number): number[] => {
    const s = H / 4;
    const l = -W / 2;
    const r = W / 2;
    return [
      tl ? l + s : l,
      -H / 2,
      tr ? r - s : r,
      -H / 2,
      br ? r - s : r,
      H / 2,
      bl ? l + s : l,
      H / 2,
    ];
  };
  return {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size,
    points,
    draw: (w, W, H, a) => poly(w, points(W, H), a),
  };
}

/** v12 `lean_right` (`[/ /]`). */
export const leanRight: PolygonShape = /* @__PURE__ */ slanted([true, false, true, false]);
/** v12 `lean_left` (`[\ \]`). */
export const leanLeft: PolygonShape = /* @__PURE__ */ slanted([false, true, false, true]);
/** v12 `trapezoid` (`[/ \]`). */
export const trapezoidBottom: PolygonShape = /* @__PURE__ */ slanted([true, true, false, false]);
/** v12 `inv_trapezoid` (`[\ /]`), which pads each side. */
export const trapezoidTop: PolygonShape = /* @__PURE__ */ slanted(
  [false, false, true, true],
  /* @__PURE__ */ padded((p) => p.lean, 0, 0.5, true)
);
