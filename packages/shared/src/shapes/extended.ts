// The shapes v12.2 added by name (`@{ shape: … }`) and the ones it draws for other diagrams'
// nodes, which only flowchart draws (those another diagram shares are `basic.ts`'s): each one's
// size from its label, its drawer, and how far its outline sits inside the layout box. Ported from Pele's src/svg/shapes.ts @ 3a2f075 (https://github.com/obsidianmd/pele,
// MIT, (c) 2026 kepano), with v12's shape names and the theme's padding and radius tokens.
// cspell:ignore kepano
import { translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';
import { drawCylinder, rhombusInset, rhombusPoints, waveInset } from './basic.ts';
import { personFigure, personSize } from './person.ts';
import {
  box,
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
  poly,
  queuePath,
  queueRim,
  queueRx,
  roundInset,
  roundSpan,
  wave,
  type Barrel,
  type PolygonShape,
  type Shape,
  type ShapeSize,
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

function triSize(tw: number, th: number, flip: boolean): ShapeSize {
  const w = Math.max(1.6 * tw + 40, 80);
  const h = (th + 10) / (1 - (tw + 8) / w);
  const dy = h / 2 - 10 - th / 2;
  return { w, h, dy: flip ? -dy : dy };
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

export const framedCircle: Shape = {
  noLabel: true,
  plain: true,
  inset: roundInset,
  span: roundSpan,
  size: /* @__PURE__ */ fixed(18, 18),
  draw: (w, W, _H, a, line) => {
    drawCircle(w, W / 2, a);
    drawCircle(w, W / 2 - 4, { ...line, fill: line.stroke }, 'part');
  },
};

export const fork: Shape = {
  noLabel: true,
  plain: true,
  span: (W, H, s) => (s ? H : W) - 8,
  size: /* @__PURE__ */ fixed(72, 8),
  // v12 forkJoin: filled plain, stroked like the outline.
  draw: (w, W, H, a, line) =>
    centred(w, W, H, { ...line, stroke: a.stroke, fill: line.stroke, filter: a.filter }, 2),
};

export const hourglass: Shape = {
  noLabel: true,
  inset: (W, _H, side) => (side & 1 ? W / 2 : 0),
  size: /* @__PURE__ */ fixed(32, 40),
  draw: (w, W, H, a) => poly(w, [-W / 2, -H / 2, W / 2, -H / 2, -W / 2, H / 2, W / 2, H / 2], a),
};

export const bolt: Shape = {
  noLabel: true,
  size: /* @__PURE__ */ fixed(36, 56),
  inset: (W, _H, side) => (side & 1 ? W / 4 : 0),
  draw: (w, W, H, a) =>
    poly(
      w,
      [
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
      ],
      a
    ),
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
  span: (W, H, s) => (s ? H : W) - 2 * CORNER - 8,
  size: /* @__PURE__ */ grown(8, 8, 4),
  draw: (w, W, H, a) => {
    for (let i = 0; i < 3; i++)
      drawRect(
        w,
        { x: -W / 2 + (2 - i) * 4, y: -H / 2 + i * 4, width: W - 8, height: H - 8, rx: undefined },
        a
      );
  },
};

export const triangle: Shape = {
  inset: (W, _H, side) => (side & 1 ? W / 4 : 0),
  size: (tw, th) => triSize(tw, th, false),
  draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
};

export const flippedTriangle: Shape = {
  inset: (W, _H, side) => (side & 1 ? W / 4 : 0),
  size: (tw, th) => triSize(tw, th, true),
  draw: (w, W, H, a) => poly(w, [-W / 2, -H / 2, W / 2, -H / 2, 0, H / 2], a),
};

export const slopedRect: Shape = {
  inset: (_W, _H, side) => (side === 0 ? 5 : 0),
  size: /* @__PURE__ */ grown(0, 10, 5),
  draw: (w, W, H, a) =>
    poly(w, [-W / 2, -H / 2 + 10, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
};

export const delay: Shape = {
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
  inset: (_W, H, side) => (side === 1 ? H * 0.2 : 0),
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
  size: /* @__PURE__ */ grown(0, 10, -5),
  draw: (w, W, H, a) => wave(w, W, H, a),
};

export const taggedDocument: Shape = {
  inset: waveInset,
  size: /* @__PURE__ */ grown(0, 10, -5),
  draw: (w, W, H, a, line) => {
    wave(w, W, H, a);
    lines(w, [W / 2 - 12, H / 2 - 14, W / 2, H / 2 - 26], line);
  },
};

export const stackedDocument: Shape = {
  inset: waveInset,
  size: /* @__PURE__ */ grown(8, 18, -1),
  draw: (w, W, H, a) => {
    for (let i = 0; i < 3; i++) {
      w.open('g', { transform: translate((1 - i) * 4, (i - 1) * 4) });
      wave(w, W - 8, H - 8, a);
      w.close();
    }
  },
};

export const flag: Shape = {
  inset: (_W, _H, side) => (side & 1 ? 0 : 8),
  size: /* @__PURE__ */ grown(0, 16),
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2 - 8;
    const q = W / 4;
    const d = w
      .path()
      .moveTo(-x, -y)
      .quadTo(-x + q, -y - 10, 0, -y)
      .quadTo(x - q, -y + 10, x, -y)
      .lineTo(x, y)
      .quadTo(x - q, y + 10, 0, y)
      .quadTo(-x + q, y - 10, -x, y)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
  },
};

export const braceLeft: Shape = {
  bare: true,
  size: /* @__PURE__ */ grown(12, 0),
  draw: (w, W, H, _a, line) => {
    centred(w, W, H, NONE);
    brace(w, -W / 2 + 12, H, -1, line);
  },
};

export const braceRight: Shape = {
  bare: true,
  size: /* @__PURE__ */ grown(12, 0),
  draw: (w, W, H, _a, line) => {
    centred(w, W, H, NONE);
    brace(w, W / 2 - 12, H, 1, line);
  },
};

export const braces: Shape = {
  bare: true,
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

export const folder: Shape = {
  size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 64), h: th + 2 * p.node.y + 8, dy: 4 }),
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    const tab = Math.min(W * 0.4, 48);
    poly(w, [-x, -y, -x + tab, -y, -x + tab + 8, -y + 8, x, -y + 8, x, y, -x, y], a);
  },
};

export const bucket: Shape = {
  size: /* @__PURE__ */ grown(20, 10, 3),
  inset: (_W, H, side) => (side & 1 ? H / 12 : 0),
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

export const terminal: Shape = {
  span: flat,
  size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 72), h: th + 2 * p.node.y + 12, dy: 6 }),
  draw: (w, W, H, a, line) => {
    const x = -W / 2;
    const y = -H / 2;
    centred(w, W, H, a);
    // prettier-ignore
    lines(w, [x, y + 12, -x, y + 12, x + 7, y + 4, x + 10, y + 6.5, x + 10, y + 6.5, x + 7, y + 9, x + 13, y + 9, x + 17, y + 9], line);
  },
};

export const browser: Shape = {
  plain: true,
  span: flat,
  size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 72), h: th + 2 * p.node.y + 12, dy: 6 }),
  draw: (w, W, H, a, line) => {
    centred(w, W, H, a);
    lines(w, [-W / 2, -H / 2 + 12, W / 2, -H / 2 + 12], line);
    for (let i = 0; i < 3; i++)
      drawCircle(w, 1.5, { ...line, fill: 'none' }, 'mark', -W / 2 + 8 + i * 7, -H / 2 + 6);
  },
};

// A head over a body in c4model.com's proportions (#683, `person.ts`).
export const person: Shape = {
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

export const bang: Shape = {
  size: /* @__PURE__ */ grown(28, 24),
  inset: () => 3,
  draw: (w, W, H, a) => {
    const pts: number[] = [];
    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * i) / 14 - Math.PI / 2;
      const k = i % 2 === 0 ? 1 : 0.82;
      pts.push(Math.cos(angle) * (W / 2) * k, Math.sin(angle) * (H / 2) * k);
    }
    poly(w, pts, a);
  },
};

export const cloud: Shape = {
  size: /* @__PURE__ */ grown(32, 24),
  inset: (_W, _H, side) => (side & 1 ? 2 : 1),
  draw: (w, W, H, a) => {
    const x = W / 2;
    const y = H / 2;
    const r = y * 0.55;
    const d = w
      .path()
      .moveTo(-x + r, y)
      .arcTo(r, r, 0, false, true, -x + r * 0.6, -y * 0.1)
      .arcTo(x * 0.42, y * 0.7, 0, false, true, -x * 0.1, -y * 0.72)
      .arcTo(x * 0.4, y * 0.62, 0, false, true, x * 0.62, -y * 0.42)
      .arcTo(r * 1.05, r * 1.05, 0, false, true, x - r, y)
      .close()
      .done();
    w.outline('node', 'path', { d, ...a });
  },
};
