// Node shapes: size from the label, outline drawn through the SvgWriter, and how far the
// outline sits inside the layout box (so edges meet the outline, not the box). Ported from
// Pele's src/svg/shapes.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano),
// with v12's shape names and the theme's padding and radius tokens.
// cspell:ignore kepano
import { translate, type Attrs, type SvgWriter } from '@mermaid-js/core/svg';

/** Room around the label, from the theme tokens. */
export interface Pads {
  x: number;
  y: number;
  /** Corner radius of rounded shapes. */
  r: number;
}

export interface ShapeSize {
  w: number;
  h: number;
  /** Shift of the label from the shape's centre. */
  dy: number;
}

type Sizer = (tw: number, th: number, p: Pads) => ShapeSize;
type Drawer = (w: SvgWriter, W: number, H: number, a: Attrs, line: Attrs, p: Pads) => void;
// Distance from the box to the outline on a side (0 top, 1 right, 2 bottom, 3 left), `t` along the side.
type Inset = (W: number, H: number, side: number, t: number) => number;
// How much of a side edges may spread along (top/bottom, or left/right when sideways).
type Span = (W: number, H: number, sideways: boolean) => number;

interface ShapeDef {
  size: Sizer;
  draw: Drawer;
  inset?: Inset;
  span?: Span;
  noLabel?: true;
  /** Draws no fill of its own, so text keeps the theme ink. */
  bare?: true;
}

const CORNER = 12;
const NONE: Attrs = { fill: 'none', stroke: 'none' };

const flat: Span = (W, H, s) => (s ? H : W) - 2 * CORNER;
const flatAcross =
  (cut: (H: number) => number): Span =>
  (W, H, s) =>
    s ? 0 : W - 2 * cut(H) - 2 * CORNER;
const bulge = (t: number, half: number, depth: number): number => {
  const k = Math.min(1, Math.abs(t) / half);
  return depth * (1 - Math.sqrt(1 - k * k));
};
const roundInset: Inset = (W, H, side, t) =>
  side & 1 ? bulge(t, H / 2, W / 2) : bulge(t, W / 2, H / 2);
const roundSpan: Span = (W, H, s) => (s ? H : W) * 0.6;
const capRy = (W: number): number => Math.min(12, Math.max(6, W / 14));
const capInset: Inset = (W, _H, side, t) => (side & 1 ? 0 : bulge(t, W / 2, capRy(W)));
const leanInset: Inset = (_W, H, side) => (side & 1 ? H / 8 : 0);
const waveInset: Inset = (_W, _H, side) => (side === 2 ? 10 : 0);

const fixed =
  (w: number, h: number): Sizer =>
  () => ({ w, h, dy: 0 });
const box: Sizer = (tw, th, p) => ({ w: Math.max(tw, 12) + 2 * p.x, h: th + 2 * p.y, dy: 0 });
// A box `ex` wider and `ey` taller than the label box, label shifted by `dy`.
const grown =
  (ex: number, ey: number, dy = 0, exH = 0): Sizer =>
  (tw, th, p) => {
    const h = th + 2 * p.y + ey;
    return { w: tw + 2 * p.x + ex + exH * h, h, dy };
  };

function rect(w: SvgWriter, x: number, y: number, W: number, H: number, a: Attrs, rx?: number) {
  w.leaf('rect', { x, y, width: W, height: H, rx, ...a });
}
const centred = (w: SvgWriter, W: number, H: number, a: Attrs, rx?: number): void =>
  rect(w, -W / 2, -H / 2, W, H, a, rx);
const poly = (w: SvgWriter, points: number[], a: Attrs): void =>
  w.leaf('polygon', { points, ...a });
const circle = (w: SvgWriter, r: number, a: Attrs, cx?: number, cy?: number): void =>
  w.leaf('circle', { cx, cy, r, ...a });
// Line segments [x0, y0, x1, y1, …] as one path, each pair of points a separate stroke.
function lines(w: SvgWriter, coords: number[], a: Attrs): void {
  const b = w.path();
  for (let i = 0; i + 3 < coords.length; i += 4)
    b.moveTo(coords[i]!, coords[i + 1]!).lineTo(coords[i + 2]!, coords[i + 3]!);
  w.leaf('path', { d: b.done(), ...a, fill: 'none' });
}

// A rectangle whose bottom is a wave.
function wave(w: SvgWriter, W: number, H: number, a: Attrs): void {
  const x = W / 2;
  const base = H / 2 - 10;
  const q = W / 4;
  const d = w
    .path()
    .moveTo(-x, -H / 2)
    .lineTo(x, -H / 2)
    .lineTo(x, base)
    .quadTo(x - q, base - 12, 0, base)
    .quadTo(-q, base + 12, -x, base)
    .close()
    .done();
  w.leaf('path', { d, ...a });
}

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
  w.leaf('path', { d, ...line, fill: 'none' });
}

function cylinder(w: SvgWriter, W: number, H: number, a: Attrs, line: Attrs, extra: number) {
  const rx = W / 2;
  const ry = capRy(W);
  const top = -H / 2 + ry;
  const bottom = H / 2 - ry;
  const d = w
    .path()
    .moveTo(-rx, top)
    .arcTo(rx, ry, 0, false, true, rx, top)
    .lineTo(rx, bottom)
    .arcTo(rx, ry, 0, false, true, -rx, bottom)
    .close()
    .done();
  w.leaf('path', { d, ...a });
  const b = w.path().moveTo(-rx, top).arcTo(rx, ry, 0, false, false, rx, top);
  if (extra) b.moveTo(-rx, top + extra).arcTo(rx, ry, 0, false, false, rx, top + extra);
  w.leaf('path', { d: b.done(), ...line, fill: 'none' });
}

function triSize(tw: number, th: number, flip: boolean): ShapeSize {
  const w = Math.max(1.6 * tw + 40, 80);
  const h = (th + 10) / (1 - (tw + 8) / w);
  const dy = h / 2 - 10 - th / 2;
  return { w, h, dy: flip ? -dy : dy };
}

const S: Record<string, ShapeDef> = {
  rect: { size: box, span: flat, draw: (w, W, H, a) => centred(w, W, H, a) },
  rounded: {
    size: box,
    span: flat,
    draw: (w, W, H, a, _l, p) => centred(w, W, H, a, Math.min(p.r, H / 2)),
  },
  stadium: {
    inset: (_W, H, side, t) => (side & 1 ? bulge(t, H / 2, H / 2) : 0),
    span: (W, H, s) => (s ? H * 0.6 : W - H),
    size: (tw, th, p) => {
      const h = th + 2 * p.y;
      return { w: tw + h * 0.5 + 2 * p.x - 8, h, dy: 0 };
    },
    draw: (w, W, H, a) => centred(w, W, H, a, H / 2),
  },
  'fr-rect': {
    span: flat,
    size: grown(16, 0),
    draw: (w, W, H, a, line) => {
      const x = W / 2 - 8;
      centred(w, W, H, a);
      lines(w, [-x, -H / 2, -x, H / 2, x, -H / 2, x, H / 2], line);
    },
  },
  cyl: {
    inset: capInset,
    span: (W, H, s) => (s ? H - 2 * CORNER - 12 : W * 0.6),
    size: (tw, th, p) => {
      const w = Math.max(tw + 2 * p.x, 56);
      const ry = capRy(w);
      return { w, h: th + 2 * p.y + 2 * ry, dy: ry / 2 };
    },
    draw: (w, W, H, a, line) => cylinder(w, W, H, a, line, 0),
  },
  'lin-cyl': {
    inset: capInset,
    span: (W, H, s) => (s ? H - 2 * CORNER - 20 : W * 0.6),
    size: (tw, th, p) => {
      const w = Math.max(tw + 2 * p.x, 56);
      const ry = capRy(w);
      return { w, h: th + 2 * p.y + 2 * ry + 8, dy: ry / 2 + 4 };
    },
    draw: (w, W, H, a, line) => cylinder(w, W, H, a, line, 8),
  },
  circle: {
    inset: roundInset,
    span: roundSpan,
    size: (tw, th) => {
      const d = Math.max(Math.hypot(tw, th) + 16, 44);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, W, _H, a) => circle(w, W / 2, a),
  },
  'dbl-circ': {
    inset: roundInset,
    span: roundSpan,
    size: (tw, th) => {
      const d = Math.max(Math.hypot(tw, th) + 26, 54);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, W, _H, a, line) => {
      circle(w, W / 2, a);
      circle(w, W / 2 - 5, { ...line, fill: 'none' });
    },
  },
  ellipse: {
    inset: roundInset,
    span: roundSpan,
    size: (tw, th, p) => ({ w: tw * 1.3 + 2 * p.x, h: th * 1.2 + 2 * p.y, dy: 0 }),
    draw: (w, W, H, a) => w.leaf('ellipse', { rx: W / 2, ry: H / 2, ...a }),
  },
  diam: {
    inset: (W, H, side, t) => (side & 1 ? (Math.abs(t) * W) / H : (Math.abs(t) * H) / W),
    span: roundSpan,
    size: (tw, th) => {
      const a = tw + 16;
      const b = th + 8;
      return { w: a + 1.6 * b, h: a / 1.6 + b, dy: 0 };
    },
    draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, 0, 0, H / 2, -W / 2, 0], a),
  },
  hex: {
    inset: (_W, _H, side, t) => (side & 1 ? Math.abs(t) / 2 : 0),
    span: (W, H, s) => (s ? H * 0.5 : W - H / 2 - CORNER),
    size: grown(0, 0, 0, 0.5),
    draw: (w, W, H, a) => {
      const m = H / 4;
      const x = W / 2;
      const y = H / 2;
      poly(w, [-x + m, -y, x - m, -y, x, 0, x - m, y, -x + m, y, -x, 0], a);
    },
  },
  odd: {
    inset: (_W, H, side) => (side === 3 ? H / 4 : 0),
    span: flatAcross(() => 0),
    size: grown(0, 0, 0, 0.25),
    draw: (w, W, H, a) => {
      const x = W / 2;
      const y = H / 2;
      poly(w, [-x, -y, x, -y, x, y, -x, y, -x + H / 4, 0], a);
    },
  },
  text: {
    bare: true,
    span: flat,
    size: (tw, th) => ({ w: tw + 8, h: th + 8, dy: 0 }),
    draw: (w, W, H) => centred(w, W, H, NONE),
  },
  'sm-circ': {
    noLabel: true,
    inset: roundInset,
    span: roundSpan,
    size: fixed(14, 14),
    draw: (w, W, _H, a) => circle(w, W / 2, a),
  },
  'f-circ': {
    noLabel: true,
    inset: roundInset,
    span: roundSpan,
    size: fixed(14, 14),
    draw: (w, W, _H, _a, line) => circle(w, W / 2, { ...line, fill: line.stroke }),
  },
  'fr-circ': {
    noLabel: true,
    inset: roundInset,
    span: roundSpan,
    size: fixed(18, 18),
    draw: (w, W, _H, a, line) => {
      circle(w, W / 2, a);
      circle(w, W / 2 - 4, { ...line, fill: line.stroke });
    },
  },
  fork: {
    noLabel: true,
    span: (W, H, s) => (s ? H : W) - 8,
    size: fixed(72, 8),
    draw: (w, W, H, _a, line) => centred(w, W, H, { ...line, fill: line.stroke }, 2),
  },
  hourglass: {
    noLabel: true,
    inset: (W, _H, side) => (side & 1 ? W / 2 : 0),
    size: fixed(32, 40),
    draw: (w, W, H, a) => poly(w, [-W / 2, -H / 2, W / 2, -H / 2, -W / 2, H / 2, W / 2, H / 2], a),
  },
  bolt: {
    noLabel: true,
    size: fixed(36, 56),
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
  },
  'cross-circ': {
    noLabel: true,
    inset: roundInset,
    span: roundSpan,
    size: fixed(44, 44),
    draw: (w, W, _H, a, line) => {
      const k = (W / 2) * Math.SQRT1_2;
      circle(w, W / 2, a);
      lines(w, [-k, -k, k, k, k, -k, -k, k], line);
    },
  },
  // v12's `choice` (state diagrams): a small diamond without a label.
  choice: {
    noLabel: true,
    inset: (W, H, side, t) => (side & 1 ? (Math.abs(t) * W) / H : (Math.abs(t) * H) / W),
    size: fixed(28, 28),
    draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, 0, 0, H / 2, -W / 2, 0], a),
  },
  // v12's `anchor`: a point edges can meet, drawn as nothing.
  anchor: { noLabel: true, bare: true, size: fixed(2, 2), draw: () => {} },
  'lean-r': {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size: grown(0, 0, 0, 0.5),
    draw: (w, W, H, a) => {
      const s = H / 4;
      poly(w, [-W / 2 + s, -H / 2, W / 2, -H / 2, W / 2 - s, H / 2, -W / 2, H / 2], a);
    },
  },
  'lean-l': {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size: grown(0, 0, 0, 0.5),
    draw: (w, W, H, a) => {
      const s = H / 4;
      poly(w, [-W / 2, -H / 2, W / 2 - s, -H / 2, W / 2, H / 2, -W / 2 + s, H / 2], a);
    },
  },
  'trap-b': {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size: grown(0, 0, 0, 0.5),
    draw: (w, W, H, a) => {
      const s = H / 4;
      poly(w, [-W / 2 + s, -H / 2, W / 2 - s, -H / 2, W / 2, H / 2, -W / 2, H / 2], a);
    },
  },
  'trap-t': {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size: grown(0, 0, 0, 0.5),
    draw: (w, W, H, a) => {
      const s = H / 4;
      poly(w, [-W / 2, -H / 2, W / 2, -H / 2, W / 2 - s, H / 2, -W / 2 + s, H / 2], a);
    },
  },
  'notch-rect': {
    size: box,
    span: flat,
    draw: (w, W, H, a) => {
      const x = W / 2;
      const y = H / 2;
      poly(w, [-x + 10, -y, x, -y, x, y, -x, y, -x, -y + 10], a);
    },
  },
  'notch-pent': {
    span: flat,
    size: box,
    draw: (w, W, H, a) => {
      const x = W / 2;
      const y = H / 2;
      poly(w, [-x + 10, -y, x - 10, -y, x, -y + 10, x, y, -x, y, -x, -y + 10], a);
    },
  },
  'lin-rect': {
    span: flat,
    size: grown(8, 0),
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(w, [-W / 2 + 8, -H / 2, -W / 2 + 8, H / 2], line);
    },
  },
  'div-rect': {
    span: flat,
    size: grown(0, 8, 4),
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(w, [-W / 2, -H / 2 + 8, W / 2, -H / 2 + 8], line);
    },
  },
  'win-pane': {
    span: flat,
    size: grown(8, 8, 4),
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(
        w,
        [-W / 2 + 8, -H / 2, -W / 2 + 8, H / 2, -W / 2, -H / 2 + 8, W / 2, -H / 2 + 8],
        line
      );
    },
  },
  'tag-rect': {
    size: box,
    span: flat,
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(w, [W / 2 - 12, H / 2, W / 2, H / 2 - 12], line);
    },
  },
  'st-rect': {
    span: (W, H, s) => (s ? H : W) - 2 * CORNER - 8,
    size: grown(8, 8, 4),
    draw: (w, W, H, a) => {
      for (let i = 0; i < 3; i++) rect(w, -W / 2 + (2 - i) * 4, -H / 2 + i * 4, W - 8, H - 8, a);
    },
  },
  tri: {
    inset: (W, _H, side) => (side & 1 ? W / 4 : 0),
    size: (tw, th) => triSize(tw, th, false),
    draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
  },
  'flip-tri': {
    inset: (W, _H, side) => (side & 1 ? W / 4 : 0),
    size: (tw, th) => triSize(tw, th, true),
    draw: (w, W, H, a) => poly(w, [-W / 2, -H / 2, W / 2, -H / 2, 0, H / 2], a),
  },
  'sl-rect': {
    inset: (_W, _H, side) => (side === 0 ? 5 : 0),
    size: grown(0, 10, 5),
    draw: (w, W, H, a) =>
      poly(w, [-W / 2, -H / 2 + 10, W / 2, -H / 2, W / 2, H / 2, -W / 2, H / 2], a),
  },
  delay: {
    size: grown(0, 0, 0, 0.25),
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
      w.leaf('path', { d, ...a });
    },
  },
  'h-cyl': {
    size: (tw, th, p) => {
      const h = th + 2 * p.y;
      return { w: tw + 2 * p.x + 2 * Math.min(12, h / 4), h, dy: 0 };
    },
    draw: (w, W, H, a, line) => {
      const ry = H / 2;
      const rx = Math.min(12, H / 4);
      const l = -W / 2 + rx;
      const r = W / 2 - rx;
      const d = w
        .path()
        .moveTo(l, -ry)
        .lineTo(r, -ry)
        .arcTo(rx, ry, 0, false, true, r, ry)
        .lineTo(l, ry)
        .arcTo(rx, ry, 0, false, true, l, -ry)
        .close()
        .done();
      w.leaf('path', { d, ...a });
      const e = w.path().moveTo(r, -ry).arcTo(rx, ry, 0, false, false, r, ry).done();
      w.leaf('path', { d: e, ...line, fill: 'none' });
    },
  },
  'curv-trap': {
    size: grown(0, 0, 0, 0.6),
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
      w.leaf('path', { d, ...a });
    },
  },
  'bow-rect': {
    size: grown(0, 0, 0, 0.4),
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
      w.leaf('path', { d, ...a });
    },
  },
  doc: { inset: waveInset, size: grown(0, 10, -5), draw: (w, W, H, a) => wave(w, W, H, a) },
  'tag-doc': {
    inset: waveInset,
    size: grown(0, 10, -5),
    draw: (w, W, H, a, line) => {
      wave(w, W, H, a);
      lines(w, [W / 2 - 12, H / 2 - 14, W / 2, H / 2 - 26], line);
    },
  },
  'lin-doc': {
    inset: waveInset,
    size: grown(8, 10, -5),
    draw: (w, W, H, a, line) => {
      wave(w, W, H, a);
      lines(w, [-W / 2 + 8, -H / 2, -W / 2 + 8, H / 2 - 6], line);
    },
  },
  docs: {
    inset: waveInset,
    size: grown(8, 18, -1),
    draw: (w, W, H, a) => {
      for (let i = 0; i < 3; i++) {
        w.open('g', { transform: translate((1 - i) * 4, (i - 1) * 4) });
        wave(w, W - 8, H - 8, a);
        w.close();
      }
    },
  },
  flag: {
    inset: (_W, _H, side) => (side & 1 ? 0 : 8),
    size: grown(0, 16),
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
      w.leaf('path', { d, ...a });
    },
  },
  brace: {
    bare: true,
    size: grown(12, 0),
    draw: (w, W, H, _a, line) => {
      centred(w, W, H, NONE);
      brace(w, -W / 2 + 12, H, -1, line);
    },
  },
  'brace-r': {
    bare: true,
    size: grown(12, 0),
    draw: (w, W, H, _a, line) => {
      centred(w, W, H, NONE);
      brace(w, W / 2 - 12, H, 1, line);
    },
  },
  braces: {
    bare: true,
    size: grown(24, 0),
    draw: (w, W, H, _a, line) => {
      centred(w, W, H, NONE);
      brace(w, -W / 2 + 12, H, -1, line);
      brace(w, W / 2 - 12, H, 1, line);
    },
  },
  datastore: {
    size: box,
    span: flat,
    draw: (w, W, H, a, line) => {
      centred(w, W, H, { ...a, stroke: 'none' });
      lines(w, [-W / 2, -H / 2, W / 2, -H / 2, -W / 2, H / 2, W / 2, H / 2], line);
    },
  },
  folder: {
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.x, 64), h: th + 2 * p.y + 8, dy: 4 }),
    draw: (w, W, H, a) => {
      const x = W / 2;
      const y = H / 2;
      const tab = Math.min(W * 0.4, 48);
      poly(w, [-x, -y, -x + tab, -y, -x + tab + 8, -y + 8, x, -y + 8, x, y, -x, y], a);
    },
  },
  bucket: {
    size: grown(20, 10, 3),
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
      w.leaf('path', { d, ...a });
      const e = w
        .path()
        .moveTo(-x, -y + 5)
        .arcTo(x, 5, 0, false, false, x, -y + 5)
        .done();
      w.leaf('path', { d: e, ...line, fill: 'none' });
    },
  },
  console: {
    span: flat,
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.x, 72), h: th + 2 * p.y + 12, dy: 6 }),
    draw: (w, W, H, a, line) => {
      const x = -W / 2;
      const y = -H / 2;
      centred(w, W, H, a);
      // prettier-ignore
      lines(w, [x, y + 12, -x, y + 12, x + 7, y + 4, x + 10, y + 6.5, x + 10, y + 6.5, x + 7, y + 9, x + 13, y + 9, x + 17, y + 9], line);
    },
  },
  browser: {
    span: flat,
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.x, 72), h: th + 2 * p.y + 12, dy: 6 }),
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(w, [-W / 2, -H / 2 + 12, W / 2, -H / 2 + 12], line);
      for (let i = 0; i < 3; i++)
        circle(w, 1.5, { ...line, fill: 'none' }, -W / 2 + 8 + i * 7, -H / 2 + 6);
    },
  },
  person: {
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.x, 56), h: th + 2 * p.y + 26, dy: 13 }),
    draw: (w, W, H, a) => {
      rect(w, -W / 2, -H / 2 + 26, W, H - 26, a, 12);
      circle(w, 13, a, undefined, -H / 2 + 14);
    },
  },
  bang: {
    size: grown(28, 24),
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
  },
  cloud: {
    size: grown(32, 24),
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
      w.leaf('path', { d, ...a });
    },
  },
  collapsedGroup: {
    size: grown(8, 8, -2),
    draw: (w, W, H, a) => {
      rect(w, -W / 2 + 6, -H / 2 + 8, W - 12, H - 8, a);
      rect(w, -W / 2, -H / 2, W, H - 4, a);
    },
  },
};

// Lookups go through a Map so names like "constructor" never reach Object.prototype.
const BY_NAME = /* @__PURE__ */ new Map(Object.entries(S));
const FALLBACK = S.rect!;

const def = (shape: string): ShapeDef => BY_NAME.get(shape) ?? FALLBACK;

export const shapeSize = (shape: string, tw: number, th: number, p: Pads): ShapeSize =>
  def(shape).size(tw, th, p);
export const drawShape = (
  shape: string,
  w: SvgWriter,
  W: number,
  H: number,
  a: Attrs,
  line: Attrs,
  p: Pads
): void => def(shape).draw(w, W, H, a, line, p);
export const shapeInset = (shape: string, W: number, H: number, side: number, t: number): number =>
  def(shape).inset?.(W, H, side, t) ?? 0;
export const shapeSpan = (shape: string, W: number, H: number, sideways: boolean): number =>
  Math.max(0, def(shape).span?.(W, H, sideways) ?? 0);
export const shapeHasLabel = (shape: string): boolean => def(shape).noLabel !== true;
export const shapeFilled = (shape: string): boolean => def(shape).bare !== true;
/** Whether the shape is drawn by its own code rather than falling back to a rectangle. */
export const isDrawnShape = (shape: string): boolean => BY_NAME.has(shape);

// v12 shape names and their aliases → the name drawn here. The first name of each group is
// the drawn one; bracket syntax types (`square`, `round`, `lean_right`, …) are aliases too.
const GROUPS =
  'rect proc process rectangle squareRect square note|rounded event roundedRect round state|' +
  'stadium terminal pill|fr-rect subprocess subproc framed-rectangle subroutine|' +
  'cyl db database cylinder|circle circ|diam decision diamond question|hex hexagon prepare|' +
  'lean-r lean-right in-out lean_right|lean-l lean-left out-in lean_left|' +
  'trap-b priority trapezoid-bottom trapezoid|trap-t manual trapezoid-top inv-trapezoid inv_trapezoid|' +
  'dbl-circ double-circle doublecircle|notch-rect card notched-rectangle|' +
  'lin-rect lined-rectangle lined-process lin-proc shaded-process|sm-circ start small-circle stateStart|' +
  'fr-circ stop framed-circle stateEnd|fork join forkJoin|hourglass collate|brace comment brace-l|' +
  'bolt com-link lightning-bolt|doc document|delay half-rounded-rectangle|h-cyl das horizontal-cylinder|' +
  'lin-cyl disk lined-cylinder|curv-trap curved-trapezoid display|' +
  'div-rect div-proc divided-rectangle divided-process|tri extract triangle|' +
  'win-pane internal-storage window-pane|f-circ junction filled-circle|' +
  'notch-pent loop-limit notched-pentagon|flip-tri manual-file flipped-triangle|' +
  'sl-rect manual-input sloped-rectangle|docs documents st-doc stacked-document|' +
  'st-rect procs processes stacked-rectangle|bow-rect stored-data bow-tie-rectangle|' +
  'cross-circ summary crossed-circle|tag-doc tagged-document|' +
  'tag-rect tagged-rectangle tag-proc tagged-process|flag paper-tape|odd rect_left_inv_arrow|' +
  'lin-doc lined-document|datastore data-store|folder directory';

let canonical: Map<string, string> | undefined;

/** The shape drawn for a v12 vertex type or `@{ shape }` name. Unknown names draw a rectangle. */
export function canonicalShape(name: string | undefined): string {
  if (name === undefined) return 'rect';
  if (!canonical) {
    canonical = new Map();
    for (const group of GROUPS.split('|')) {
      const names = group.split(' ');
      for (const n of names) canonical.set(n, names[0]!);
    }
  }
  return canonical.get(name) ?? (BY_NAME.has(name) ? name : 'rect');
}
