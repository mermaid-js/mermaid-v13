/**
 * Architecture edges (D507): where each line runs, its arrowheads and its label, worked out
 * before anything is written so the root's viewBox can hold them.
 *
 * - **Ends.** `compass` ends an edge on the node's box (D501): `left`/`right` at the icon's centre
 *   line, `top`/`bottom` at the middle of the box, a `{group}` end on the group's border. As v12
 *   drew it (`svgDraw.ts:65-86`), an end on a junction runs on to the junction's centre unless it
 *   is a `{group}` end, and a `left`/`right` end on a service whose label is wider than its icon
 *   runs on to the icon (v12's cytoscape node was the icon alone).
 * - **Line.** The route as `compass` gives it: v12's straight line or single bend wherever the
 *   route has at most one bend, `compass`'s router where it needs more (like-side and self edges,
 *   detours), with square corners as v12's.
 * - **Arrowheads.** v12's triangles (`architectureTypes.ts:36-48`), `iconSize / 6`, their tip
 *   2 px past the end into the node, written with absolute points. Where both ends have one and
 *   the line is shorter than the two (a large `iconSize`, as `compass`'s cell gap is fixed: GAPS
 *   T3), both shrink to half the line.
 * - **Label.** Placed as v12 placed it (`svgDraw.ts:127-188`), from the two sides: between left
 *   and right sides, wrapped to the line's length and hung 1em under its midpoint; between top
 *   and bottom, wrapped to two thirds of it and turned −90° about the midpoint, so it reads up
 *   the line beside it; on a bend, wrapped to half its width, turned ±45° and set inside the
 *   corner. On a route with more bends, which v12 could not draw, the label stays flat and
 *   unwrapped where `compass` placed it.
 */
import type { LayoutModelEdge, LayoutModelNode, Point } from '@mermaid-js/core/layout';
import { layoutLabel, type FontKey, type MeasuredLabel } from '@mermaid-js/core/text';
import type { ArchitectureSizes } from '../layout/metrics.ts';
import type { ArchitectureEdge, ArchitectureSide } from '../model.ts';
import type { ArchitectureRenderContext } from './context.ts';

/** How far an arrowhead's tip runs past the end, into the node (v12's `± 2` shift). */
const TIP = 2;

/** An axis-aligned box: left, top, right, bottom. */
export interface Extent {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A placed edge label: its box centred on `at`, turned `angle` degrees about that point. */
export interface PlacedLabel {
  readonly box: MeasuredLabel;
  /** The point the label is drawn centred on, before the turn. */
  readonly at: Point;
  /** Degrees; 0 for a flat label. */
  readonly angle: number;
  /** The point the turn is about. */
  readonly about: Point;
  /** The drawn label's bounding box, the turn included. */
  readonly extent: Extent;
}

/** A drawn edge. */
export interface EdgeScene {
  readonly points: readonly Point[];
  /** Arrowhead triangles as flat x, y lists, source end first. */
  readonly heads: readonly (readonly number[])[];
  readonly label?: PlacedLabel;
  /** Both heads were shrunk to fit the line. */
  readonly shrunk: boolean;
}

/** What an edge end meets. */
export interface EdgeEnd {
  readonly box: LayoutModelNode;
  readonly junction: boolean;
}

const horizontal = (side: ArchitectureSide): boolean => side === 'L' || side === 'R';

/**
 * v12's arrowhead (`ArchitectureDirectionArrow`) for an end on `side` at `end`, `size` across,
 * moved as `ArchitectureDirectionArrowShift` moved it: its tip `TIP` past the end, into the node.
 */
export function arrowhead(side: ArchitectureSide, end: Point, size: number): number[] {
  const h = size / 2;
  // Corner of the triangle's box, then its three corners in v12's order.
  let x: number;
  let y: number;
  let pts: number[];
  switch (side) {
    case 'L':
      [x, y] = [end.x - size + TIP, end.y - h];
      pts = [size, h, 0, size, 0, 0];
      break;
    case 'R':
      [x, y] = [end.x - TIP, end.y - h];
      pts = [0, h, size, 0, size, size];
      break;
    case 'T':
      [x, y] = [end.x - h, end.y - size + TIP];
      pts = [0, 0, size, 0, h, size];
      break;
    case 'B':
      [x, y] = [end.x - h, end.y - TIP];
      pts = [h, 0, size, size, 0, size];
      break;
  }
  return pts.map((v, i) => v + (i % 2 === 0 ? x : y));
}

/** `p` run on along its side's axis to where v12 ended the edge on `end`. */
function endPoint(
  p: Point,
  side: ArchitectureSide,
  group: boolean,
  end: EdgeEnd,
  sizes: ArchitectureSizes
): Point {
  if (group) return p;
  const { box } = end;
  if (end.junction) return horizontal(side) ? { x: box.x, y: p.y } : { x: p.x, y: box.y };
  if (horizontal(side) && box.width > sizes.iconSize) {
    const half = sizes.iconSize / 2;
    return { x: side === 'L' ? box.x - half : box.x + half, y: p.y };
  }
  return p;
}

/** The route without repeated points or points in the middle of a straight run. */
function corners(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    const before = out[out.length - 2];
    if (
      before &&
      last &&
      ((before.x === last.x && last.x === p.x) || (before.y === last.y && last.y === p.y))
    )
      out.pop();
    out.push(p);
  }
  return out;
}

const lengthOf = (points: readonly Point[]): number => {
  let sum = 0;
  for (let i = 1; i < points.length; i++)
    sum += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  return sum;
};

/** The box a `width` × `height` label centred on `at` covers once turned `angle` degrees. */
function turnedExtent(at: Point, width: number, height: number, angle: number): Extent {
  const r = (angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  const hw = (width * c + height * s) / 2;
  const hh = (width * s + height * c) / 2;
  return { x0: at.x - hw, y0: at.y - hh, x1: at.x + hw, y1: at.y + hh };
}

/**
 * v12's `getArchitectureDirectionXYFactors`: which way from the corner a bend's label goes, into
 * the corner.
 */
function bendFactors(lhs: ArchitectureSide, rhs: ArchitectureSide): [number, number] {
  const pair = new Set([lhs, rhs]);
  if (pair.has('L')) return pair.has('T') ? [1, 1] : [1, -1];
  return pair.has('B') ? [-1, -1] : [-1, 1];
}

export interface EdgeInputs {
  readonly edge: ArchitectureEdge;
  readonly route: LayoutModelEdge;
  readonly source: EdgeEnd;
  readonly target: EdgeEnd;
  /** The label as the layout measured it (unwrapped); absent for `--`. */
  readonly label?: MeasuredLabel;
}

/** Where an edge's line, heads and label go. */
export function edgeScene(
  { edge, route, source, target, label }: EdgeInputs,
  sizes: ArchitectureSizes,
  font: FontKey,
  ctx: ArchitectureRenderContext
): EdgeScene {
  const raw = route.points;
  const first = raw[0]!;
  const last = raw[raw.length - 1]!;
  const start = endPoint(first, edge.lhsDir, edge.lhsGroup, source, sizes);
  const end = endPoint(last, edge.rhsDir, edge.rhsGroup, target, sizes);
  const points = corners([start, ...raw.slice(1, -1), end]);

  let size = sizes.arrow;
  let shrunk = false;
  if (edge.lhsInto && edge.rhsInto) {
    const run = lengthOf(points);
    if (run < 2 * size) {
      size = run / 2;
      shrunk = true;
    }
  }
  const heads: number[][] = [];
  if (edge.lhsInto) heads.push(arrowhead(edge.lhsDir, start, size));
  if (edge.rhsInto) heads.push(arrowhead(edge.rhsDir, end, size));

  const placed = label && placeLabel({ edge, route, label }, points, font, ctx);
  return { points, heads, shrunk, ...(placed ? { label: placed } : {}) };
}

/** Which way v12 set a label: along a level line, up a vertical one, or across a bend. */
type LabelAxis = 'X' | 'Y' | 'XY';

function axisOf(lhs: ArchitectureSide, rhs: ArchitectureSide): LabelAxis {
  if (horizontal(lhs) !== horizontal(rhs)) return 'XY';
  return horizontal(lhs) ? 'X' : 'Y';
}

/** v12's wrap width: the line, two thirds of it on Y (clear of the service labels), half on a bend. */
function wrapWidth(axis: LabelAxis, dx: number, dy: number): number {
  if (axis === 'X') return dx;
  return axis === 'Y' ? dy / 1.5 : dx / 2;
}

function placeLabel(
  { edge, route, label: measured }: Pick<EdgeInputs, 'edge' | 'route'> & { label: MeasuredLabel },
  points: readonly Point[],
  font: FontKey,
  ctx: ArchitectureRenderContext
): PlacedLabel | undefined {
  const raw = route.points;
  const bends = points.length - 2;
  if (bends > 1) {
    // `compass`'s router: flat, where the engine made room for it.
    const at = route.label ?? middleOf(points);
    return {
      box: measured,
      at,
      angle: 0,
      about: at,
      extent: turnedExtent(at, measured.width, measured.height, 0),
    };
  }
  const start = points[0]!;
  const end = points[points.length - 1]!;
  // v12's midpoint: the corner of a bend, else halfway between the engine's ends.
  const mid =
    bends === 1
      ? points[1]!
      : {
          x: (raw[0]!.x + raw[raw.length - 1]!.x) / 2,
          y: (raw[0]!.y + raw[raw.length - 1]!.y) / 2,
        };
  const dx = Math.abs(start.x - end.x);
  const dy = Math.abs(start.y - end.y);
  const axis = axisOf(edge.lhsDir, edge.rhsDir);
  const wrap = wrapWidth(axis, dx, dy);
  const box = layoutLabel(edge.title!, font, wrap > 0 ? wrap : Infinity, ctx.measurer, {
    markdown: true,
    inline: ctx.inline,
  });
  if (box.lines.length === 0) return undefined;
  if (axis === 'XY') {
    const [fx, fy] = bendFactors(edge.lhsDir, edge.rhsDir);
    const angle = -fx * fy * 45;
    // The turned label's box is square, (w + h) / √2 a side; v12 set it in the corner's quarter.
    const side = (box.width + box.height) / Math.SQRT2;
    const at = { x: mid.x + (fx * side) / 2, y: mid.y + (fy * side) / 2 };
    return { box, at, angle, about: at, extent: turnedExtent(at, box.width, box.height, angle) };
  }
  // v12's text hung from the midpoint: the first line's middle 1em below it.
  const drop = font.size + (box.height - box.lineHeight) / 2;
  const at = { x: mid.x, y: mid.y + drop };
  if (axis === 'X')
    return { box, at, angle: 0, about: mid, extent: turnedExtent(at, box.width, box.height, 0) };
  // Turned −90° about the midpoint: the hang becomes a step to the right of the line.
  const centre = { x: mid.x + drop, y: mid.y };
  return {
    box,
    at,
    angle: -90,
    about: mid,
    extent: turnedExtent(centre, box.width, box.height, -90),
  };
}

/** The point halfway along `points`. */
function middleOf(points: readonly Point[]): Point {
  const half = lengthOf(points) / 2;
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const step = Math.hypot(b.x - a.x, b.y - a.y);
    if (walked + step >= half && step > 0) {
      const t = (half - walked) / step;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    walked += step;
  }
  return points[0]!;
}
