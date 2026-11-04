// Node shapes: size from the label, outline drawn through the SvgWriter, and how far the
// outline sits inside the layout box (so edges meet the outline, not the box). Ported from
// Pele's src/svg/shapes.ts @ 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano),
// with v12's shape names and the theme's padding and radius tokens.
// cspell:ignore kepano
import { translate, type Attrs, type SafeValue, type SvgWriter } from '@mermaid-js/core/svg';
import { SHAPE_GROUPS } from '../parser/shapes.ts';

/** Padding added across (`x`) and down (`y`). */
export interface PadXY {
  readonly x: number;
  readonly y: number;
}

/** Room around the label, from the theme's padding variables (D152) and `flowchart.padding`. */
export interface Pads {
  /** `nodePaddingX` / `nodePaddingY`, per side: the rectangle and the shapes that share it. */
  readonly node: PadXY;
  /** Corner radius of rounded shapes. */
  readonly r: number;
  /** `flowchart.padding`: the diamond and rounded rectangle use it in every theme. */
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

export interface ShapeSize {
  w: number;
  h: number;
  /** Shift of the label from the shape's centre. */
  dy: number;
}

type Sizer = (tw: number, th: number, p: Pads) => ShapeSize;
type Drawer = (w: SvgWriter, W: number, H: number, a: Attrs, line: Attrs, p: Pads) => void;
// Distance from the box to the outline on a side (0 top, 1 right, 2 bottom, 3 left), `t` along the side.
type Inset = (W: number, H: number, side: number, t: number, p: Pads) => number;
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
// A rounded corner of radius r on a side of length `len`: how far in the outline is at `t`.
const cornerInset = (len: number, t: number, r: number): number => {
  const k = Math.abs(t) - (len / 2 - r);
  return r > 0 && k > 0 ? r - Math.sqrt(Math.max(0, r * r - Math.min(k, r) ** 2)) : 0;
};

// The collapsed-subgraph card (v12 collapsedGroup): fixed padding, gap and indicator row.
const CARD_PAD = 8;
const CARD_GAP = 8;
const CARD_ROW = 20;
const CARD_MIN_W = 80;
const cardRadius = (W: number, H: number, p: Pads): number => Math.min(p.r, W / 2, H / 2);

const fixed =
  (w: number, h: number): Sizer =>
  () => ({ w, h, dy: 0 });
const box: Sizer = (tw, th, p) => ({
  w: Math.max(tw, 12) + 2 * p.node.x,
  h: th + 2 * p.node.y,
  dy: 0,
});
// A box `ex` wider and `ey` taller than the label box, label shifted by `dy`.
const grown =
  (ex: number, ey: number, dy = 0, exH = 0): Sizer =>
  (tw, th, p) => {
    const h = th + 2 * p.node.y + ey;
    return { w: tw + 2 * p.node.x + ex + exH * h, h, dy };
  };

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

// v12 cylinder: the padding plus a cap height on top of the label (the body between the caps'
// front edges is label + padding + ry), `extra` more for the lined cylinder's second rim.
function cylinderSize(tw: number, th: number, p: Pads, extra: number): ShapeSize {
  const w = Math.max(tw + p.cylinder.x, 56);
  const ry = capRy(w);
  return { w, h: th + p.cylinder.y + 3 * ry + extra, dy: ry / 2 + extra / 2 };
}

function triSize(tw: number, th: number, flip: boolean): ShapeSize {
  const w = Math.max(1.6 * tw + 40, 80);
  const h = (th + 10) / (1 - (tw + 8) / w);
  const dy = h / 2 - 10 - th / 2;
  return { w, h, dy: flip ? -dy : dy };
}

/** A diamond with its points at the middle of each side. */
const rhombus: Pick<ShapeDef, 'inset' | 'draw'> = {
  inset: (W, H, side, t) => (side & 1 ? (Math.abs(t) * W) / H : (Math.abs(t) * H) / W),
  draw: (w, W, H, a) => poly(w, [0, -H / 2, W / 2, 0, 0, H / 2, -W / 2, 0], a),
};

/**
 * A box with some corners cut in by a quarter of its height: the lean and trapezoid shapes.
 * Corners go clockwise from the top left.
 */
function slanted(tl: boolean, tr: boolean, br: boolean, bl: boolean, size = lean): ShapeDef {
  return {
    inset: leanInset,
    span: flatAcross((H) => H / 4),
    size,
    draw: (w, W, H, a) => {
      const s = H / 4;
      const l = -W / 2;
      const r = W / 2;
      poly(
        w,
        [
          tl ? l + s : l,
          -H / 2,
          tr ? r - s : r,
          -H / 2,
          br ? r - s : r,
          H / 2,
          bl ? l + s : l,
          H / 2,
        ],
        a
      );
    },
  };
}

const S: Record<string, ShapeDef> = {
  rect: { size: box, span: flat, draw: (w, W, H, a) => centred(w, W, H, a) },
  rounded: {
    // v12 roundedRect: `padding` per side in every theme.
    size: (tw, th, p) => ({ w: Math.max(tw, 12) + 2 * p.pad, h: th + 2 * p.pad, dy: 0 }),
    span: flat,
    draw: (w, W, H, a, _l, p) => centred(w, W, H, a, Math.min(p.r, H / 2)),
  },
  stadium: {
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
  },
  'fr-rect': {
    span: flat,
    // v12 subroutine: the padding inside the two 8px frames.
    size: padded((p) => p.subroutine, 16),
    draw: (w, W, H, a, line) => {
      const x = W / 2 - 8;
      centred(w, W, H, a);
      lines(w, [-x, -H / 2, -x, H / 2, x, -H / 2, x, H / 2], line);
    },
  },
  cyl: {
    inset: capInset,
    span: (W, H, s) => (s ? H - 2 * CORNER - 12 : W * 0.6),
    size: (tw, th, p) => cylinderSize(tw, th, p, 0),
    draw: (w, W, H, a, line) => cylinder(w, W, H, a, line, 0),
  },
  'lin-cyl': {
    inset: capInset,
    span: (W, H, s) => (s ? H - 2 * CORNER - 20 : W * 0.6),
    size: (tw, th, p) => cylinderSize(tw, th, p, 8),
    draw: (w, W, H, a, line) => cylinder(w, W, H, a, line, 8),
  },
  circle: {
    inset: roundInset,
    span: roundSpan,
    size: (tw, th, p) => {
      const d = Math.max(Math.hypot(tw, th) + p.circlePad, p.circleMin);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, W, _H, a) => circle(w, W / 2, a),
  },
  'dbl-circ': {
    inset: roundInset,
    span: roundSpan,
    // v12: the inner ring clears the label diagonal by ringPad, the outer ring is ringGap out.
    size: (tw, th, p) => {
      const d = Math.hypot(tw, th) + 2 * (p.ringPad + p.ringGap);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, W, _H, a, line, p) => {
      circle(w, W / 2, a);
      circle(w, Math.max(0, W / 2 - p.ringGap), { ...line, fill: 'none' });
    },
  },
  ellipse: {
    inset: roundInset,
    span: roundSpan,
    size: (tw, th, p) => ({ w: tw * 1.3 + 2 * p.node.x, h: th * 1.2 + 2 * p.node.y, dy: 0 }),
    draw: (w, W, H, a) => w.leaf('ellipse', { rx: W / 2, ry: H / 2, ...a }),
  },
  diam: {
    ...rhombus,
    span: roundSpan,
    // v12 question: a square rhombus, side = label width + label height + 2 × padding.
    size: (tw, th, p) => {
      const s = tw + th + 2 * p.pad;
      return { w: s, h: s, dy: 0 };
    },
  },
  hex: {
    inset: (_W, _H, side, t, p) => (side & 1 ? (2 * Math.abs(t)) / p.hexagonSlant : 0),
    span: (W, H, s) => (s ? H * 0.5 : W - H / 2 - CORNER),
    // v12 hexagon with the axes corrected (D151): X padding to the width, Y to the height.
    size: (tw, th, p) => {
      const h = th + p.hexagon.y;
      return { w: tw + 2 * (h / p.hexagonSlant) + p.hexagon.x, h, dy: 0 };
    },
    draw: (w, W, H, a, _l, p) => {
      const m = H / p.hexagonSlant;
      const x = W / 2;
      const y = H / 2;
      poly(w, [-x + m, -y, x - m, -y, x, 0, x - m, y, -x + m, y, -x, 0], a);
    },
  },
  odd: {
    inset: (_W, H, side) => (side === 3 ? H / 4 : 0),
    span: flatAcross(() => 0),
    // v12 rect_left_inv_arrow.
    size: padded((p) => p.odd, 0, 0.25),
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
    draw: (w, W, _H, a, line) => circle(w, W / 2, { ...line, fill: line.stroke, filter: a.filter }),
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
    draw: (w, W, H, a, line) =>
      centred(w, W, H, { ...line, fill: line.stroke, filter: a.filter }, 2),
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
  choice: { ...rhombus, noLabel: true, size: fixed(28, 28) },
  // v12's `anchor`: a point edges can meet, drawn as nothing.
  anchor: { noLabel: true, bare: true, size: fixed(2, 2), draw: () => {} },
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
      const h = th + 2 * p.node.y;
      return { w: tw + 2 * p.node.x + 2 * Math.min(12, h / 4), h, dy: 0 };
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
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 64), h: th + 2 * p.node.y + 8, dy: 4 }),
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
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 72), h: th + 2 * p.node.y + 12, dy: 6 }),
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
    size: (tw, th, p) => ({ w: Math.max(tw + 2 * p.node.x, 72), h: th + 2 * p.node.y + 12, dy: 6 }),
    draw: (w, W, H, a, line) => {
      centred(w, W, H, a);
      lines(w, [-W / 2, -H / 2 + 12, W / 2, -H / 2 + 12], line);
      for (let i = 0; i < 3; i++)
        circle(w, 1.5, { ...line, fill: 'none' }, -W / 2 + 8 + i * 7, -H / 2 + 6);
    },
  },
  person: {
    size: (tw, th, p) => ({
      w: Math.max(tw + 2 * p.node.x, 56),
      h: th + 2 * p.node.y + 26,
      dy: 13,
    }),
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
  // v12's collapsedGroup: a rounded card, the label above a dashed separator and an indicator
  // row of three dots. Padding is v12's fixed 8, not the theme's; `line` carries clusterBorder.
  collapsedGroup: {
    span: flat,
    inset: (W, H, side, t, p) => cornerInset(side & 1 ? H : W, t, cardRadius(W, H, p)),
    size: (tw, th) => ({
      w: Math.max(tw + 2 * CARD_PAD, CARD_MIN_W),
      h: th + CARD_GAP + CARD_ROW + 2 * CARD_PAD,
      dy: -(CARD_GAP + CARD_ROW) / 2,
    }),
    draw: (w, W, H, a, line, p) => {
      const x = -W / 2;
      const y = -H / 2;
      rect(w, x, y, W, H, a, cardRadius(W, H, p));
      const th = H - CARD_GAP - CARD_ROW - 2 * CARD_PAD;
      const sy = y + CARD_PAD + th + CARD_GAP;
      w.leaf('line', {
        class: 'collapsed-separator',
        x1: x + CARD_PAD,
        y1: sy,
        x2: x + W - CARD_PAD,
        y2: sy,
        stroke: line.stroke,
        'stroke-width': 0.75,
        'stroke-dasharray': '3,3' as SafeValue,
      });
      for (let i = -1; i <= 1; i++)
        w.leaf('circle', {
          class: 'collapsed-indicator',
          cx: i * 10,
          cy: sy + CARD_ROW / 2,
          r: 2.5,
          fill: line.stroke,
          opacity: 0.6,
        });
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
export const shapeInset = (
  shape: string,
  W: number,
  H: number,
  side: number,
  t: number,
  p: Pads
): number => def(shape).inset?.(W, H, side, t, p) ?? 0;
export const shapeSpan = (shape: string, W: number, H: number, sideways: boolean): number =>
  Math.max(0, def(shape).span?.(W, H, sideways) ?? 0);
export const shapeHasLabel = (shape: string): boolean => def(shape).noLabel !== true;
export const shapeFilled = (shape: string): boolean => def(shape).bare !== true;
/** Whether the shape is drawn by its own code rather than falling back to a rectangle. */
export const isDrawnShape = (shape: string): boolean => BY_NAME.has(shape);

// v12 shape names, their aliases and the bracket syntax types → the name drawn here.
const CANONICAL: ReadonlyMap<string, string> = /* @__PURE__ */ new Map([
  ...SHAPE_GROUPS.flatMap((names) => names.map((n) => [n, names[0]!] as const)),
  ['square', 'rect'],
  ['round', 'rounded'],
]);

/** The shape drawn for a v12 vertex type or `@{ shape }` name. Unknown names draw a rectangle. */
export function canonicalShape(name: string | undefined): string {
  if (name === undefined) return 'rect';
  return CANONICAL.get(name) ?? (BY_NAME.has(name) ? name : 'rect');
}
