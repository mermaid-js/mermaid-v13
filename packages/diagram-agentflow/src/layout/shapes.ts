/**
 * The shapes agentflow draws a vertex or a collapsed flow with: size from the label, how far
 * edges may spread along a side, and the outline (D446: a local copy of v13 flowchart's sizing
 * for these seven shapes, never an import; v12 `fa796a943` names in brackets). The outline is
 * the one geometry the layout ends edges on (`ends.ts`) and the renderer (#548) draws, as a
 * closed polygon in the shape's own frame (centre at 0, y down), curves sampled.
 *
 * Flowchart's shape code is ported from Pele's `src/svg/shapes.ts` at 3a2f075
 * (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano). Changed: cut to agentflow's seven
 * shapes, with the outline as the one geometry layout and renderer share.
 * cspell:ignore kepano
 */
import type { Point } from '@mermaid-js/core/layout';
import type { AgentflowShape } from '../parser/index.ts';
import type { AgentflowMetrics } from './metrics.ts';

/** Padding added across (`x`) and down (`y`). */
export interface PadXY {
  readonly x: number;
  readonly y: number;
}

/** Room around the label: the theme's padding variables (D152) and `flowchart.padding` (D466). */
export interface Pads {
  /** `nodePaddingX` / `nodePaddingY`, per side (the refdoc). */
  readonly node: PadXY;
  /** `radius`: corner radius of the rounded shapes. */
  readonly r: number;
  /** `flowchart.padding`, per side (the task box and the decision). */
  readonly pad: number;
  /** `hexagonPaddingX` (to the width) / `hexagonPaddingY` (to the height), totals. */
  readonly hexagon: PadXY;
  /** `hexagonSlant`: each pointed end of an action is its height over this. */
  readonly hexagonSlant: number;
  /** `subroutinePadding*` (tool) and `leanPadding*` (input): totals. */
  readonly subroutine: PadXY;
  readonly lean: PadXY;
}

/** Every shape the layout sizes: the vertex shapes and v12's collapsed-flow card. */
export type LayoutShape = AgentflowShape | 'collapsedGroup';

/** What every shape is measured and outlined with: the theme's padding and the metrics table. */
export interface ShapeGeometry {
  readonly pads: Pads;
  readonly metrics: AgentflowMetrics;
}

export interface ShapeSize {
  w: number;
  h: number;
  /** Shift of the label from the shape's centre. */
  dy: number;
}

interface ShapeDef {
  size(tw: number, th: number, g: ShapeGeometry): ShapeSize;
  /** How much of a side edges may spread along (top/bottom, or left/right when sideways). */
  span(W: number, H: number, sideways: boolean, g: ShapeGeometry): number;
  outline(W: number, H: number, g: ShapeGeometry): Point[];
  /** The corner radius of a rounded outline; none for the others. */
  radius?(W: number, H: number, g: ShapeGeometry): number;
}

/** A `W` × `H` box with corners of radius `r`, clockwise from the top left corner's arc. */
function roundedBox(W: number, H: number, r: number, steps: number): Point[] {
  const x = W / 2;
  const y = H / 2;
  if (r <= 0) {
    return [
      { x: -x, y: -y },
      { x, y: -y },
      { x, y },
      { x: -x, y },
    ];
  }
  const out: Point[] = [];
  // Each corner's centre and the angle its quarter arc starts at (y down: clockwise).
  const corners: [number, number, number][] = [
    [-x + r, -y + r, Math.PI],
    [x - r, -y + r, -Math.PI / 2],
    [x - r, y - r, 0],
    [-x + r, y - r, Math.PI / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2);
      out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  }
  return out;
}

const flat: ShapeDef['span'] = (W, H, s, { metrics: m }) => (s ? H : W) - 2 * m.corner;

const SHAPES: Readonly<Record<LayoutShape, ShapeDef>> = {
  // v12 roundedRect (task, connector, and every removed or unsupported shape): `padding` a side.
  rounded: {
    size: (tw, th, { pads: p, metrics: m }) => ({
      w: Math.max(tw, m.minLabel) + 2 * p.pad,
      h: th + 2 * p.pad,
      dy: 0,
    }),
    span: flat,
    radius: (W, H, { pads: p }) => Math.min(p.r, W / 2, H / 2),
    outline: (W, H, g) => roundedBox(W, H, cornerRadius('rounded', W, H, g), g.metrics.curveSteps),
  },
  // v12 subroutine (tool): the theme's padding inside the two side frames.
  'fr-rect': {
    size: (tw, th, { pads: p, metrics: m }) => ({
      w: tw + p.subroutine.x + 2 * m.frame,
      h: th + p.subroutine.y,
      dy: 0,
    }),
    span: flat,
    outline: (W, H) => roundedBox(W, H, 0, 0),
  },
  // v12 lean-right (input): the top left and bottom right corners cut in.
  'lean-r': {
    size: (tw, th, { pads: p, metrics: m }) => {
      const h = th + p.lean.y;
      return { w: tw + p.lean.x + m.leanGrow * h, h, dy: 0 };
    },
    span: (W, H, s, { metrics: m }) => (s ? 0 : W - 2 * m.leanCut * H - 2 * m.corner),
    outline: (W, H, { metrics: m }) => {
      const c = m.leanCut * H;
      return [
        { x: -W / 2 + c, y: -H / 2 },
        { x: W / 2, y: -H / 2 },
        { x: W / 2 - c, y: H / 2 },
        { x: -W / 2, y: H / 2 },
      ];
    },
  },
  // v12 question (decision): a square rhombus, side = label width + height + 2 × padding.
  diam: {
    size: (tw, th, { pads: p }) => {
      const s = tw + th + 2 * p.pad;
      return { w: s, h: s, dy: 0 };
    },
    span: (W, H, s, { metrics: m }) => (s ? H : W) * m.roundSpan,
    outline: (W, H) => [
      { x: 0, y: -H / 2 },
      { x: W / 2, y: 0 },
      { x: 0, y: H / 2 },
      { x: -W / 2, y: 0 },
    ],
  },
  // v12 lined document (refdoc): a box whose bottom is a wave, and a rule down its left side.
  'lin-doc': {
    size: (tw, th, { pads: p, metrics: m }) => ({
      w: tw + 2 * p.node.x + m.docRule,
      h: th + 2 * p.node.y + m.wave.depth,
      dy: -m.wave.depth / 2,
    }),
    // Edges meet the middle of each side: the wave has no flat stretch to spread along.
    span: () => 0,
    outline: (W, H, { metrics: m }) => {
      const x = W / 2;
      const base = H / 2 - m.wave.depth;
      const k = 2 * m.wave.control;
      const n = 2 * m.curveSteps;
      const out: Point[] = [
        { x: -x, y: -H / 2 },
        { x, y: -H / 2 },
      ];
      // Two quadratic halves from the right: up between the right end and the middle, down
      // between the middle and the left end (control points `control` above and below).
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        out.push({ x: x * (1 - t), y: base - k * t * (1 - t) });
      }
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        out.push({ x: -x * t, y: base + k * t * (1 - t) });
      }
      return out;
    },
  },
  // v12 hexagon (action), with the padding axes corrected (D151).
  hex: {
    size: (tw, th, { pads: p }) => {
      const h = th + p.hexagon.y;
      return { w: tw + 2 * (h / p.hexagonSlant) + p.hexagon.x, h, dy: 0 };
    },
    span: (W, H, s, { metrics: m }) => (s ? H * m.hexSpan : W - H / 2 - m.corner),
    outline: (W, H, { pads: p }) => {
      const c = H / p.hexagonSlant;
      const x = W / 2;
      const y = H / 2;
      return [
        { x: -x + c, y: -y },
        { x: x - c, y: -y },
        { x, y: 0 },
        { x: x - c, y },
        { x: -x + c, y },
        { x: -x, y: 0 },
      ];
    },
  },
  // v12 collapsedGroup: a rounded card, the label above an indicator row, v12's fixed padding.
  collapsedGroup: {
    size: (tw, th, { metrics: m }) => ({
      w: Math.max(tw + 2 * m.card.pad, m.card.minWidth),
      h: th + m.card.gap + m.card.row + 2 * m.card.pad,
      dy: -(m.card.gap + m.card.row) / 2,
    }),
    span: flat,
    radius: (W, H, { metrics: m }) => Math.min(m.flowRadius, W / 2, H / 2),
    outline: (W, H, g) =>
      roundedBox(W, H, cornerRadius('collapsedGroup', W, H, g), g.metrics.curveSteps),
  },
};

export const shapeSize = (
  shape: LayoutShape,
  tw: number,
  th: number,
  g: ShapeGeometry
): ShapeSize => SHAPES[shape].size(tw, th, g);

export const shapeSpan = (
  shape: LayoutShape,
  W: number,
  H: number,
  sideways: boolean,
  g: ShapeGeometry
): number => Math.max(0, SHAPES[shape].span(W, H, sideways, g));

/** The corner radius of a rounded shape's outline (the task box and the card), else 0. */
export const cornerRadius = (shape: LayoutShape, W: number, H: number, g: ShapeGeometry): number =>
  SHAPES[shape].radius?.(W, H, g) ?? 0;

/** The shape's outline in its own frame: a closed polygon, centre at 0, y down. */
export const shapeOutline = (shape: LayoutShape, W: number, H: number, g: ShapeGeometry): Point[] =>
  SHAPES[shape].outline(W, H, g);
