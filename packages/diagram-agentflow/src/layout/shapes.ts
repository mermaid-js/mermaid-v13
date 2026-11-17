/**
 * The shapes agentflow draws a vertex or a collapsed flow with: which of the shared shapes
 * (`@mermaid-js/shared/shapes/*`, v12 `fa796a943` names in brackets) each is sized and spread
 * with, and its outline. The outline is the one geometry the layout ends edges on (`ends.ts`)
 * and the renderer (#548) draws, as a closed polygon in the shape's own frame (centre at 0, y
 * down), curves sampled.
 *
 * The rounded box and the wave are sampled from the shapes ported from Pele's
 * `src/svg/shapes.ts` at 3a2f075 (https://github.com/obsidianmd/pele, MIT, (c) 2026 kepano).
 * Changed: the outline as points, the one geometry layout and renderer share.
 * cspell:ignore kepano
 */
import type { Point } from '@mermaid-js/core/layout';
import {
  collapsedGroup,
  diamond,
  framedRect,
  hexagon,
  leanRight,
  linedDocument,
  rounded,
} from '@mermaid-js/shared/shapes/basic';
import {
  WAVE,
  type Pads,
  type PolygonShape,
  type Shape,
  type ShapeSize,
} from '@mermaid-js/shared/shapes/kit';
import type { AgentflowShape } from '../parser/index.ts';
import type { AgentflowMetrics } from './metrics.ts';

export type { Pads, PadXY } from '@mermaid-js/shared/shapes/kit';

/** Every shape the layout sizes: the vertex shapes and v12's collapsed-flow card. */
export type LayoutShape = AgentflowShape | 'collapsedGroup';

/** What every shape is measured and outlined with: the theme's padding and the metrics table. */
export interface ShapeGeometry {
  readonly pads: Pads;
  readonly metrics: AgentflowMetrics;
}

interface ShapeDef {
  /** The shared shape it is sized as, and edges spread along. */
  readonly shape: Shape;
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

/** A straight-sided shape: its outline is the shared shape's polygon. */
const polygon = (shape: PolygonShape): ShapeDef => ({
  shape,
  outline: (W, H, { pads }) => {
    const flat = shape.points(W, H, pads);
    const out: Point[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i]!, y: flat[i + 1]! });
    return out;
  },
});

const SHAPES: Readonly<Record<LayoutShape, ShapeDef>> = {
  // v12 roundedRect (task, connector, and every removed or unsupported shape).
  rounded: {
    shape: rounded,
    radius: (W, H, { pads: p }) => Math.min(p.r, W / 2, H / 2),
    outline: (W, H, g) => roundedBox(W, H, cornerRadius('rounded', W, H, g), g.metrics.curveSteps),
  },
  // v12 subroutine (tool): a square box.
  'fr-rect': { shape: framedRect, outline: (W, H) => roundedBox(W, H, 0, 0) },
  // v12 lean-right (input): the top left and bottom right corners cut in.
  'lean-r': polygon(leanRight),
  // v12 question (decision): a square rhombus.
  diam: polygon(diamond),
  // v12 lined document (refdoc): a box whose bottom is a wave. Edges meet the middle of each
  // side: the wave has no flat stretch to spread along.
  'lin-doc': {
    shape: linedDocument,
    outline: (W, H, { metrics: m }) => {
      const x = W / 2;
      const base = H / 2 - WAVE.depth;
      const k = 2 * WAVE.control;
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
  // v12 hexagon (action).
  hex: polygon(hexagon),
  // v12 collapsedGroup: a rounded card, the label above an indicator row, v12's fixed padding.
  collapsedGroup: {
    shape: collapsedGroup,
    radius: (W, H, { metrics: m }) => Math.min(m.flowRadius, W / 2, H / 2),
    outline: (W, H, g) =>
      roundedBox(W, H, cornerRadius('collapsedGroup', W, H, g), g.metrics.curveSteps),
  },
};

/** The shared shape `shape` is sized as, whose drawer and `plain` flag the renderer reads. */
export const sharedShape = (shape: LayoutShape): Shape => SHAPES[shape].shape;

export const shapeSize = (
  shape: LayoutShape,
  tw: number,
  th: number,
  g: ShapeGeometry
): ShapeSize => SHAPES[shape].shape.size(tw, th, g.pads);

export const shapeSpan = (shape: LayoutShape, W: number, H: number, sideways: boolean): number =>
  Math.max(0, SHAPES[shape].shape.span?.(W, H, sideways) ?? 0);

/** The corner radius of a rounded shape's outline (the task box and the card), else 0. */
export const cornerRadius = (shape: LayoutShape, W: number, H: number, g: ShapeGeometry): number =>
  SHAPES[shape].radius?.(W, H, g) ?? 0;

/** The shape's outline in its own frame: a closed polygon, centre at 0, y down. */
export const shapeOutline = (shape: LayoutShape, W: number, H: number, g: ShapeGeometry): Point[] =>
  SHAPES[shape].outline(W, H, g);
