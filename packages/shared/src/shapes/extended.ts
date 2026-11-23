// The shapes v12.2 added by name (`@{ shape: … }`) and the ones it draws for other diagrams'
// nodes, which only flowchart draws (those another diagram shares are `basic.ts`'s): each one's
// size from its label, its drawer, and how far its outline sits inside the layout box. Ported
// from Pele's src/svg/shapes.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026
// kepano), with v12's shape names and the theme's padding and radius tokens.
// cspell:ignore kepano
import { checkStyle, translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import { drawCylinder, rhombusInset, rhombusPoints, waveInset } from './basic.ts';
import { cloudOutline, outlineBox, outlinePoints, type Box, type Outline } from './outline.ts';
import {
  box,
  bulge,
  capInset,
  centred,
  CORNER,
  cylinderSize,
  drawCircle,
  drawRect,
  fixed,
  flat,
  grown,
  lines,
  NONE,
  personFigure,
  personSize,
  poly,
  polygonInset,
  queuePath,
  queueRim,
  queueRx,
  roundInset,
  roundSpan,
  wave,
  WAVE,
  waveDip,
  type Inset,
  type Barrel,
  type Frame,
  type PolygonShape,
  type Shape,
  type ShapeSize,
  type Sizer,
  type Span,
} from './kit.ts';

function brace(w: SvgWriter, x: number, H: number, dir: number, line: Attrs): void {
  const y = H / 2;
  const k = 6 * dir;
  const d = w
    .path()
    .moveTo(x, -y)
    .quadTo(x + k, -y, x + k, -y + 6)
    .lineTo(x + k, -6)
    .quadTo(x + k, 0, x + 2 * k, 0)
    .quadTo(x + k, 0, x + k, 6)
    .lineTo(x + k, y - 6)
    .quadTo(x + k, y, x, y)
    .done();
  w.outline('node', 'path', { d, ...line, fill: 'none' });
}

/**
 * v12's triangle (#395): as wide as it is tall, `h = label width + padding + label height`, the
 * label at the base (at the top when flipped) with half the padding below it (D603 leaves it as
 * v12 had it).
 */
function triSize(tw: number, th: number, flip: boolean, pad: number): ShapeSize {
  const h = tw + pad + th;
  const dy = h / 2 - th / 2 - pad / 2;
  return { w: h, h, dy: flip ? -dy : dy };
}

/**
 * How far a triangle's outline is inside its box: on the slanted sides (1 right, 3 left) by how
 * far along them `t` is, from the apex end, and on the apex's own side by how far `t` is across
 * (the apex is at the top, or the bottom when `flip`). The base side is on the box.
 */
function triInset(flip: boolean): Inset {
  return (W, H, side, t) => {
    if (side & 1) {
      const fromApex = Math.min(H, Math.max(0, flip ? H / 2 + t : H / 2 - t));
      return (W / 2) * (fromApex / H);
    }
    return side === (flip ? 2 : 0) ? Math.min(H, (2 * H * Math.abs(t)) / W) : 0;
  };
}

/** Each layer of a stacked rectangle is offset this far from the one behind it (D603, v12's). */
const STACK_RECT = 5;
/** Each layer of a stacked document (v12's `multiWaveEdgedRectangle`, D603). */
const STACK_DOC = 10;

/** A sizer whose label also sits `s` left: on the front layer of a stack, as in v12. */
const leftOf =
  (size: Sizer, s: number): Sizer =>
  (tw, th, p) => ({ ...size(tw, th, p), dx: -s });

/**
 * Three layers, back to front, each `s` further left and down: layer `i` covers x from
 * `-W/2 + (2-i)s` to `W/2 - i s` and y from `-H/2 + i s` to `H/2 - (2-i)s - drop` (`drop`: how
 * far a document's wave line is above its layer's box bottom). How far the union is inside the
 * box on `side` at `t`: the layer under `t`, or the nearest, from the back for the top and right
 * and from the front for the bottom and left.
 */
function stackInset(s: number, drop: number): Inset {
  return (W, H, side, t) => {
    const sideways = (side & 1) === 1;
    const half = (sideways ? H : W) / 2;
    const at = Math.min(half, Math.max(-half, t));
    const lo = (i: number): number => (sideways ? -H / 2 + i * s : -W / 2 + (2 - i) * s);
    const hi = (i: number): number => (sideways ? H / 2 - (2 - i) * s - drop : W / 2 - i * s);
    const back = side === 0 || side === 1;
    let best = back ? 0 : 2;
    let gap = Infinity;
    for (let k = 0; k < 3; k++) {
      const i = back ? k : 2 - k;
      const g = Math.max(lo(i) - at, at - hi(i), 0);
      if (g < gap) {
        gap = g;
        best = i;
      }
    }
    return back ? best * s : (2 - best) * s;
  };
}

/**
 * How far the bottom of a stack of documents is inside the box at `t`: the lowest of the layers'
 * waves there. A wave is two quadratic curves, which dip `WAVE.control / 2` below the line on the
 * left half and rise as far on the right, so the bottom is no flat 10 inside the box but
 * `24 u (1 - u)` off it, `u` the distance from the layer's middle in half widths.
 */
function stackedDocumentBottom(s: number): Inset {
  return (W, H, _side, t) => {
    const half = (W - 2 * s) / 2;
    // An end past the corner of the box takes the corner, as `stackInset` does.
    const at = Math.min(W / 2, Math.max(-W / 2, t));
    let lowest = -Infinity;
    for (let i = 0; i < 3; i++) {
      const x = at - (1 - i) * s;
      if (Math.abs(x) > half) continue;
      lowest = Math.max(lowest, H / 2 - WAVE.depth - (2 - i) * s + waveDip(x, half));
    }
    return H / 2 - lowest;
  };
}

/** v12 `lin-cyl`: a cylinder with a second rim. */
export const linedCylinder: Shape = {
  inset: capInset,
  span: (W, H, s) => (s ? H - 2 * CORNER - 20 : W * 0.6),
  size: (tw, th, p) => cylinderSize(tw, th, p.cylinder, 8),
  draw: (w, W, H, a, line) => drawCylinder(w, { W, H, extra: 8 }, a, line),
};

export const ellipse: Shape = {
  inset: roundInset,
  span: roundSpan,
  size: (tw, th, p) => ({ w: tw * 1.3 + 2 * p.node.x, h: th * 1.2 + 2 * p.node.y, dy: 0 }),
  draw: (w, W, H, a) => w.outline('node', 'ellipse', { rx: W / 2, ry: H / 2, ...a }),
};

export const text: Shape = {
  bare: true,
  span: flat,
  size: (tw, th) => ({ w: tw + 8, h: th + 8, dy: 0 }),
  draw: (w, W, H) => centred(w, W, H, NONE),
};

export const smallCircle: Shape = {
  noLabel: true,
  inset: roundInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(14, 14),
  draw: (w, W, _H, a) => drawCircle(w, W / 2, a),
};

export const filledCircle: Shape = {
  noLabel: true,
  plain: true,
  inset: roundInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(14, 14),
  // The outline's stroke (the gradient under neo, D182), filled with the line colour.
  draw: (w, W, _H, a, line) =>
    drawCircle(w, W / 2, {
      stroke: a.stroke,
      'stroke-width': line['stroke-width'],
      fill: line.stroke,
      filter: a.filter,
    }),
};

/** v12 `stateEnd` as flowchart drew it: a ring 14 across round one 5 across, both hollow (D683). */
export const framedCircle: Shape = {
  noLabel: true,
  inset: roundInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(14, 14),
  draw: (w, W, _H, a) => {
    drawCircle(w, W / 2, a);
    drawCircle(w, (W * 5) / 28, { ...a, filter: undefined }, 'part');
  },
};

/** A small shape's span: 4 kept clear at each end, so edges on a short side still separate. */
const narrow: Span = (W, H, s) => (s ? H : W) - 8;

export const fork: Shape = {
  noLabel: true,
  span: narrow,
  // v12 forkJoin is 70 × 10 (D604); a diagram that flows sideways swaps the two.
  size: /* @__PURE__ */ fixed(70, 10),
  // v12 flowcharts drew the bar hollow, with square corners, as any outline (D683).
  draw: (w, W, H, a) => centred(w, W, H, a),
};

const hourglassPoints = (W: number, H: number): number[] => [
  -W / 2,
  -H / 2,
  W / 2,
  -H / 2,
  -W / 2,
  H / 2,
  W / 2,
  H / 2,
];

export const hourglass: Shape = {
  noLabel: true,
  inset: /* @__PURE__ */ polygonInset(hourglassPoints),
  span: narrow,
  size: /* @__PURE__ */ fixed(32, 40),
  draw: (w, W, H, a) => poly(w, hourglassPoints(W, H), a),
};

const boltPoints = (W: number, H: number): number[] => [
  W * 0.15,
  -H / 2,
  -W / 2,
  H * 0.08,
  -W * 0.05,
  H * 0.08,
  -W * 0.15,
  H / 2,
  W / 2,
  -H * 0.08,
  W * 0.05,
  -H * 0.08,
];

export const bolt: Shape = {
  noLabel: true,
  size: /* @__PURE__ */ fixed(36, 56),
  inset: /* @__PURE__ */ polygonInset(boltPoints),
  span: roundSpan,
  draw: (w, W, H, a) => poly(w, boltPoints(W, H), a),
};

export const crossedCircle: Shape = {
  noLabel: true,
  inset: roundInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(44, 44),
  draw: (w, W, _H, a, line) => {
    const k = (W / 2) * Math.SQRT1_2;
    drawCircle(w, W / 2, a);
    lines(w, [-k, -k, k, k, k, -k, -k, k], line);
  },
};

/** v12's `choice` (state diagrams): a small diamond without a label. */
export const choice: PolygonShape = {
  noLabel: true,
  inset: rhombusInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(28, 28),
  points: rhombusPoints,
  draw: (w, W, H, a) => poly(w, rhombusPoints(W, H), a),
};

/** v12's `anchor`: a point edges can meet, drawn as nothing. */
export const anchor: Shape = {
  noLabel: true,
  bare: true,
  size: /* @__PURE__ */ fixed(2, 2),
  draw: () => undefined,
};

export const notchedRect: Shape = {
  size: box,
  span: flat,
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    poly(w, [-x + 10, -y, x, -y, x, y, -x, y, -x, -y + 10], a);
  },
};

export const notchedPentagon: Shape = {
  span: flat,
  size: box,
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    poly(w, [-x + 10, -y, x - 10, -y, x, -y + 10, x, y, -x, y, -x, -y + 10], a);
  },
};

export const linedRect: Shape = {
  plain: true,
  span: flat,
  size: /* @__PURE__ */ grown(8, 0),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    lines(w, [-W / 2 + 8, -H / 2, -W / 2 + 8, H / 2], line);
  },
};

export const dividedRect: Shape = {
  plain: true,
  span: flat,
  size: /* @__PURE__ */ grown(0, 8, 4),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    lines(w, [-W / 2, -H / 2 + 8, W / 2, -H / 2 + 8], line);
  },
};

export const windowPane: Shape = {
  span: flat,
  size: /* @__PURE__ */ grown(8, 8, 4),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    lines(w, [-W / 2 + 8, -H / 2, -W / 2 + 8, H / 2, -W / 2, -H / 2 + 8, W / 2, -H / 2 + 8], line);
  },
};

export const taggedRect: Shape = {
  size: box,
  span: flat,
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    lines(w, [W / 2 - 12, H / 2, W / 2, H / 2 - 12], line);
  },
};

export const stackedRect: Shape = {
  inset: /* @__PURE__ */ stackInset(STACK_RECT, 0),
  span: (W, H, s) => (s ? H : W) - 2 * CORNER - 2 * STACK_RECT,
  size: /* @__PURE__ */ leftOf(grown(2 * STACK_RECT, 2 * STACK_RECT, STACK_RECT), STACK_RECT),
  draw: (w, W, H, a) => {
    const s = STACK_RECT;
    for (let i = 0; i < 3; i++)
      drawRect(
        w,
        {
          x: -W / 2 + (2 - i) * s,
          y: -H / 2 + i * s,
          width: W - 2 * s,
          height: H - 2 * s,
          rx: undefined,
        },
        a
      );
  },
};

export const triangle: Shape = {
  inset: /* @__PURE__ */ triInset(false),
  span: flat,
  size: (tw, th, p) => triSize(tw, th, false, p.pad),
  draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
};

export const flippedTriangle: Shape = {
  inset: /* @__PURE__ */ triInset(true),
  span: flat,
  size: (tw, th, p) => triSize(tw, th, true, p.pad),
  draw: (w, W, H, a) => poly(w, [-W / 2, -H / 2, W / 2, -H / 2, 0, H / 2], a),
};

export const slopedRect: Shape = {
  // The top falls 10 from left to right: 5 inside the box at the middle.
  inset: (W, _H, side, t) => (side ? 0 : 5 - (10 * Math.max(-W / 2, Math.min(W / 2, t))) / W),
  span: flat,
  size: /* @__PURE__ */ grown(0, 10, 5),
  draw: (w, W, H, a) =>
    poly(w, [-W / 2, -H / 2 + 10, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
};

export const delay: Shape = {
  // The right end is a half circle of radius H / 2.
  inset: (W, H, side, t) => {
    const r = H / 2;
    if (side === 3) return 0;
    return side === 1 ? bulge(t, r, r) : bulge(Math.max(0, t - W / 2 + r), r, r);
  },
  span: flat,
  size: /* @__PURE__ */ grown(0, 0, 0, 0.25),
  draw: (w, W, H, a) => {
    const r = H / 2;
    const d = w
      .path()
      .moveTo(-W / 2, -r)
      .lineTo(W / 2 - r, -r)
      .arcTo(r, r, 0, false, true, W / 2 - r, r)
      .lineTo(-W / 2, r)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
  },
};

/** v12 `h-cyl`: a cylinder on its side. */
export const horizontalCylinder: Shape = {
  // The caps, left and right, are half ellipses `queueRx` deep.
  inset: (W, H, side, t) => {
    const rx = queueRx(H);
    return side & 1 ? bulge(t, H / 2, rx) : bulge(Math.max(0, Math.abs(t) - W / 2 + rx), rx, H / 2);
  },
  span: (W, H, s) => (s ? H * 0.6 : W - 2 * CORNER),
  size: (tw, th, p) => {
    const h = th + 2 * p.node.y;
    return { w: tw + 2 * p.node.x + 2 * queueRx(h), h, dy: 0 };
  },
  draw: (w, W, H, a, line) => {
    const ry = H / 2;
    const rx = queueRx(H);
    const barrel: Barrel = { left: -W / 2 + rx, right: W / 2 - rx, top: -ry, bottom: ry, rx, ry };
    w.outline('node', 'path', { d: queuePath(w, barrel), ...a });
    w.outline('divider', 'path', { d: queueRim(w, barrel), ...line, fill: 'none' });
  },
};

export const curvedTrapezoid: Shape = {
  // A point on the left, `k` deep, and a half ellipse `k` deep on the right.
  inset: (W, H, side, t) => {
    const k = H * 0.3;
    const x = W / 2;
    const y = H / 2;
    if (side & 1) return side === 1 ? bulge(t, y, k) : k * Math.min(1, Math.abs(t) / y);
    return t < k - x ? Math.min(y, (y * (k - x - t)) / k) : bulge(Math.max(0, t - x + k), k, y);
  },
  span: flat,
  size: /* @__PURE__ */ grown(0, 0, 0, 0.6),
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    const k = H * 0.3;
    const d = w
      .path()
      .moveTo(-x + k, -y)
      .lineTo(x - k, -y)
      .arcTo(k, y, 0, false, true, x - k, y)
      .lineTo(-x + k, y)
      .lineTo(-x, 0)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
  },
};

export const bowRect: Shape = {
  size: /* @__PURE__ */ grown(0, 0, 0, 0.4),
  // Both ends are half ellipses `k` deep, bowed out on the left and in on the right.
  inset: (W, H, side, t) => {
    const k = H * 0.2;
    if (side & 1) return side === 1 ? k - bulge(t, H / 2, k) : bulge(t, H / 2, k);
    return bulge(Math.min(0, t + W / 2 - k), k, H / 2);
  },
  span: flat,
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    const k = H * 0.2;
    const d = w
      .path()
      .moveTo(-x + k, -y)
      .lineTo(x, -y)
      .arcTo(k, y, 0, false, false, x, y)
      .lineTo(-x + k, y)
      .arcTo(k, y, 0, false, true, -x + k, -y)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
  },
};

/** v12 `doc`: a box whose bottom is a wave. */
export const doc: Shape = {
  inset: waveInset,
  span: flat,
  size: /* @__PURE__ */ grown(0, 10, -5),
  draw: (w, W, H, a) => wave(w, W, H, a),
};

export const taggedDocument: Shape = {
  inset: waveInset,
  span: flat,
  size: /* @__PURE__ */ grown(0, 10, -5),
  draw: (w, W, H, a, line) => {
    wave(w, W, H, a);
    lines(w, [W / 2 - 12, H / 2 - 14, W / 2, H / 2 - 26], line);
  },
};

const sidesOfDocuments = /* @__PURE__ */ stackInset(STACK_DOC, WAVE.depth);
const bottomOfDocuments = /* @__PURE__ */ stackedDocumentBottom(STACK_DOC);

export const stackedDocument: Shape = {
  span: (W, H, s) => (s ? H : W) - 2 * CORNER - 2 * STACK_DOC,
  inset: (W, H, side, t, p) =>
    side === 2 ? bottomOfDocuments(W, H, side, t, p) : sidesOfDocuments(W, H, side, t, p),
  size: /* @__PURE__ */ leftOf(
    grown(2 * STACK_DOC, 2 * STACK_DOC + WAVE.depth, STACK_DOC - WAVE.depth / 2),
    STACK_DOC
  ),
  draw: (w, W, H, a) => {
    const s = STACK_DOC;
    for (let i = 0; i < 3; i++) {
      w.open('g', { transform: translate((1 - i) * s, (i - 1) * s) });
      wave(w, W - 2 * s, H - 2 * s, a);
      w.close();
    }
  },
};

/**
 * v12 `waveRectangle`: a body `h = th + pad` high whose top and bottom are each one sine cycle
 * `h / 8` deep (`H / 12` in its `1.5 h` box), the top right bulging up and the bottom left down.
 * How far both lines are above where they cross the sides, at `x`.
 */
const flagWave = (W: number, H: number, x: number): number =>
  (H / 12) * Math.sin((2 * Math.PI * x) / W);

/** v12's 50 steps along each side. */
const FLAG_STEPS = 50;

export const flag: Shape = {
  // `a` (H / 12) at the side's middle, rising and falling `a` about it.
  inset: (W, H, side, t) => {
    const a = H / 12;
    const at = Math.min(W / 2, Math.max(-W / 2, t));
    return side & 1 ? 0 : a + (side ? 1 : -1) * flagWave(W, H, at);
  },
  // The sides are `2a` shorter than the box.
  span: (W, H, s) => (s ? H - H / 6 : W) - 2 * CORNER,
  size: (tw, th, p) => ({ w: tw + 2 * p.pad, h: 1.5 * (th + p.pad), dy: 0 }),
  draw: (w, W, H, a) => {
    const y = H / 2 - H / 12;
    const points: number[] = [];
    for (let i = 0; i <= FLAG_STEPS; i++) {
      const x = -W / 2 + (W * i) / FLAG_STEPS;
      points.push(x, y - flagWave(W, H, x));
    }
    for (let i = 0; i <= FLAG_STEPS; i++) {
      const x = W / 2 - (W * i) / FLAG_STEPS;
      points.push(x, -y - flagWave(W, H, x));
    }
    poly(w, points, a);
  },
};

export const braceLeft: Shape = {
  bare: true,
  span: flat,
  size: /* @__PURE__ */ grown(12, 0),
  draw: (w, W, H, _a, line) => {
    centred(w, W, H, NONE);
    brace(w, -W / 2 + 12, H, -1, line);
  },
};

export const braceRight: Shape = {
  bare: true,
  span: flat,
  size: /* @__PURE__ */ grown(12, 0),
  draw: (w, W, H, _a, line) => {
    centred(w, W, H, NONE);
    brace(w, W / 2 - 12, H, 1, line);
  },
};

export const braces: Shape = {
  bare: true,
  span: flat,
  size: /* @__PURE__ */ grown(24, 0),
  draw: (w, W, H, _a, line) => {
    centred(w, W, H, NONE);
    brace(w, -W / 2 + 12, H, -1, line);
    brace(w, W / 2 - 12, H, 1, line);
  },
};

export const datastore: Shape = {
  size: box,
  span: flat,
  draw: (w, W, H, a, line) => {
    centred(w, W, H, { ...a, stroke: 'none' });
    lines(w, [-W / 2, -H / 2, W / 2, -H / 2, -W / 2, H / 2, W / 2, H / 2], line);
  },
};

const folderPoints = (W: number, H: number): number[] => {
  const x = W / 2;
  const y = H / 2;
  const tab = Math.min(W * 0.4, 48);
  return [-x, -y, -x + tab, -y, -x + tab + 8, -y + 8, x, -y + 8, x, y, -x, y];
};

export const folder: Shape = {
  inset: /* @__PURE__ */ polygonInset(folderPoints),
  span: flat,
  size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 64), h: th + 2 * p.node.y + 8, dy: 4 }),
  draw: (w, W, H, a) => poly(w, folderPoints(W, H), a),
};

export const bucket: Shape = {
  size: /* @__PURE__ */ grown(20, 10, 3),
  // Rims 5 deep, the sides drawn in by H / 6 from the top rim to the bottom one.
  inset: (W, H, side, t) => {
    if (side & 1) return (Math.min(1, Math.max(0, (t + H / 2 - 5) / (H - 10))) * H) / 6;
    return bulge(t, side ? W / 2 - H / 6 : W / 2, 5);
  },
  span: (W, H, s) => (s ? H : W - H / 3) - 2 * CORNER,
  draw: (w, W, H, a, line) => {
    const x = W / 2;
    const y = H / 2;
    const t = H / 6;
    const d = w
      .path()
      .moveTo(-x, -y + 5)
      .arcTo(x, 5, 0, false, true, x, -y + 5)
      .lineTo(x - t, y - 5)
      .arcTo(x - t, 5, 0, false, true, -x + t, y - 5)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
    const e = w
      .path()
      .moveTo(-x, -y + 5)
      .arcTo(x, 5, 0, false, false, x, -y + 5)
      .done();
    w.outline('divider', 'path', { d: e, ...line, fill: 'none' });
  },
};

/** v12's console and browser windows: rounded 12, at least 90 wide, `band` over the label. */
const windowSize =
  (band: number): Sizer =>
  (tw, th, p) => ({ w: Math.max(tw + 2 * p.pad, 90), h: th + 2 * p.pad + band, dy: band / 2 });

/** v12 `consoleWindow`: the prompt `>_` in the top left, as text in the border colour. */
export const terminal: Shape = {
  plain: true,
  span: flat,
  size: /* @__PURE__ */ windowSize(20),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a, 12);
    w.open('text', {
      x: -W / 2 + 12,
      y: -H / 2 + 16,
      ...checkStyle(['font-family:monospace']).text,
      'font-weight': 'bold',
      'font-size': 14,
      fill: line.stroke,
    });
    w.text('>_');
    w.close();
  },
};

/** v12 `browser`: an 18 high bar of three dots and an address bar, in the border colour. */
export const browser: Shape = {
  plain: true,
  span: flat,
  size: /* @__PURE__ */ windowSize(18),
  draw: (w, W, H, a, line) => {
    const x = -W / 2;
    const y = -H / 2;
    centred(w, W, H, a, 12);
    lines(w, [x, y + 18, -x, y + 18], line);
    for (let i = 0; i < 3; i++)
      drawCircle(w, 2.5, { fill: line.stroke, stroke: 'none' }, 'mark', x + 12 + i * 9, y + 9);
    w.outline('divider', 'rect', {
      x: x + 44,
      y: y + 4,
      width: Math.max(W - 56, 10),
      height: 10,
      rx: 3,
      ...line,
      fill: 'none',
      opacity: 0.6,
    });
  },
};

// A head over a body in c4model.com's proportions (#683, `person.ts`).
export const person: Shape = {
  // Ends on top spread over the head, ends on the sides along the body and into its top corners.
  inset: (W, H, side, t) => {
    const { r, bodyTop } = personFigure(W, H);
    const k = Math.min(CORNER, bodyTop + CORNER - t);
    if (side & 1) return k > 0 ? CORNER - Math.sqrt(CORNER * CORNER - k * k) : 0;
    if (side) return 0;
    return Math.abs(t) < r ? bulge(t, r, r) : bodyTop + H / 2;
  },
  span: (W, H, s) => {
    const { r, bodyTop } = personFigure(W, H);
    return s ? -2 * bodyTop - CORNER : 1.2 * r;
  },
  size: (tw, th, p) => {
    const w = Math.max(tw + 2 * p.node.x, 56);
    return { w, ...personSize(w, th + 2 * p.node.y) };
  },
  draw: (w, W, H, a) => {
    const { r, bodyTop } = personFigure(W, H);
    drawRect(w, { x: -W / 2, y: bodyTop, width: W, height: H / 2 - bodyTop, rx: CORNER }, a);
    drawCircle(w, r, a, 'node', undefined, -H / 2 + r);
  },
};

function bangPoints(W: number, H: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 28; i++) {
    const angle = (Math.PI * i) / 14 - Math.PI / 2;
    const k = i % 2 === 0 ? 1 : 0.82;
    pts.push(Math.cos(angle) * (W / 2) * k, Math.sin(angle) * (H / 2) * k);
  }
  return pts;
}

export const bang: Shape = {
  size: /* @__PURE__ */ grown(28, 24),
  // Ends stop on the polygon through the spikes' tips, so an arrowhead never reaches into a notch.
  inset: /* @__PURE__ */ polygonInset((W, H) => bangPoints(W, H).filter((_, i) => i % 4 < 2)),
  span: roundSpan,
  draw: (w, W, H, a) => poly(w, bangPoints(W, H), a),
};

/** v12's cloud round a frame and how far it moves to centre the box it covers at 0. */
function placedCloud({ w, h }: Frame): { o: Outline; b: Box; dx: number; dy: number } {
  const o = cloudOutline(w, h);
  const b = outlineBox(o);
  return { o, b, dx: -(b.x0 + b.x1) / 2, dy: -(b.y0 + b.y1) / 2 };
}

/**
 * v12 `cloud`: ten arcs round the label and its padding (the frame), which bulge out of it; the
 * node is the box they cover, the label at the frame's centre (as mindmap's cloud, D683). Edge
 * ends stop on the arcs, each in 16 straight pieces (under 0.2 off them). Without a frame, the
 * box is taken for one.
 */
export const cloud: Shape = {
  size: (tw, th, p) => {
    const frame = { w: tw + p.pad, h: th + p.pad };
    const { b, dx, dy } = placedCloud(frame);
    return { w: b.x1 - b.x0, h: b.y1 - b.y0, dx, dy, frame };
  },
  inset: /* @__PURE__ */ polygonInset((W, H, p) => {
    const { o, dx, dy } = placedCloud(p.frame ?? { w: W, h: H });
    return outlinePoints(o, 16, dx, dy);
  }),
  span: roundSpan,
  draw: (w, W, H, a, _line, p) => {
    const { o, dx, dy } = placedCloud(p.frame ?? { w: W, h: H });
    const d = w.path().moveTo(o.start.x + dx, o.start.y + dy);
    for (const c of o.arcs) d.arcTo(c.rx, c.ry, c.rotation, c.large, c.sweep, c.x + dx, c.y + dy);
    w.outline('node', 'path', { d: d.close().done(), ...a });
  },
};
