/**
 * The edges and their labels (spec #521 T4): v12's `insertEdges`, drawn after every block. An
 * edge is one `path.flowchart-link` with v12's `edge-thickness-*` and `edge-pattern-*` classes,
 * stopped short of the outlines for its arrowheads, which follow it inline. Edges are plain
 * leaves: v12 never sketched them (D447).
 */
import type { Attrs, PathData, SvgWriter } from '@mermaid-js/core/svg';
import type { BlockEdgeLayout, PlacedLabel, Point } from '../layout/types.ts';
import { marker, markerTrim, type LineEnd } from './arrowheads.ts';
import { BLOCK_RENDER } from './metrics.ts';
import type { Scene } from './render.ts';

/** The unit vector from `a` to `b`; straight down where they coincide. */
function unit(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 1 };
}

const along = (p: Point, u: Point, k: number): Point => ({ x: p.x + u.x * k, y: p.y + u.y * k });

/** The path, trimmed for its heads, and where each head goes. */
interface Drawn {
  readonly d: PathData;
  readonly start: LineEnd;
  readonly end: LineEnd;
}

/**
 * A `line` edge (`[start, middle, end]`, all on one segment) as one straight segment; a `loop`
 * (`[start, c1, c2, end]`) as its cubic. Each end is trimmed back along its tangent by its head's
 * trim, a loop's control points with it, so the curve keeps its shape; a segment too short for
 * both trims shares what it has.
 */
function edgePath(w: SvgWriter, e: BlockEdgeLayout, trimStart: number, trimEnd: number): Drawn {
  const p = e.points;
  const s = p[0]!;
  const t = p[p.length - 1]!;
  if (e.kind === 'loop' && p.length === 4) {
    const u1 = unit(s, p[1]!);
    const u2 = unit(p[2]!, t);
    const d = w
      .path()
      .moveTo(along(s, u1, trimStart).x, along(s, u1, trimStart).y)
      .curveTo(
        along(p[1]!, u1, trimStart).x,
        along(p[1]!, u1, trimStart).y,
        along(p[2]!, u2, -trimEnd).x,
        along(p[2]!, u2, -trimEnd).y,
        along(t, u2, -trimEnd).x,
        along(t, u2, -trimEnd).y
      )
      .done();
    return {
      d,
      start: { x: s.x, y: s.y, dx: -u1.x, dy: -u1.y },
      end: { x: t.x, y: t.y, dx: u2.x, dy: u2.y },
    };
  }
  const u = unit(s, t);
  const len = Math.hypot(t.x - s.x, t.y - s.y);
  const k = trimStart + trimEnd > len ? len / (trimStart + trimEnd) : 1;
  const a = along(s, u, trimStart * k);
  const b = along(t, u, -trimEnd * k);
  return {
    d: w.path().moveTo(a.x, a.y).lineTo(b.x, b.y).done(),
    start: { x: s.x, y: s.y, dx: -u.x, dy: -u.y },
    end: { x: t.x, y: t.y, dx: u.x, dy: u.y },
  };
}

/** v12's classes: thickness, pattern, then `flowchart-link`. */
const edgeClass = (e: BlockEdgeLayout): string =>
  `edge-thickness-${e.thickness} edge-pattern-${e.pattern} flowchart-link`;

/** One edge: its path (`data-id`, `data-ast`), then its arrowheads. */
export function drawEdge({ w, paint }: Scene, e: BlockEdgeLayout): void {
  const edge = paint.edge!;
  const { heads } = edge;
  const path = edgePath(
    w,
    e,
    markerTrim(e.arrowTypeStart, heads),
    markerTrim(e.arrowTypeEnd, heads)
  );
  const dotted = e.pattern === 'dotted';
  w.leaf('path', {
    class: edgeClass(e),
    'data-id': e.id,
    'data-ast': e.ast,
    d: path.d,
    fill: 'none',
    stroke: edge.line,
    'stroke-width': e.thickness === 'thick' ? BLOCK_RENDER.thickEdge : paint.node.strokeWidth,
    'stroke-dasharray': dotted ? BLOCK_RENDER.dottedEdge : undefined,
    // v12 drew dotted edges with butt caps; round caps would close a 2 px dash's gaps.
    'stroke-linecap': dotted ? 'butt' : 'round',
  });
  const head: Attrs = { fill: edge.arrow };
  marker(w, e.arrowTypeStart, path.start, head, heads);
  marker(w, e.arrowTypeEnd, path.end, head, heads);
}

/** v12's edge label: a `g.edgeLabel` (`data-id` only), its background box, then its text. */
export function drawEdgeLabel({ w, paint }: Scene, e: BlockEdgeLayout, label: PlacedLabel): void {
  const edge = paint.edge!;
  const pad = BLOCK_RENDER.edgeLabelPad;
  w.open('g', { class: 'edgeLabel', 'data-id': e.id });
  w.leaf('rect', {
    x: label.x - pad,
    y: label.y,
    width: label.width + 2 * pad,
    height: label.height,
    rx: BLOCK_RENDER.edgeLabelRadius,
    fill: edge.labelFill,
  });
  w.label(label.text, label.x + label.width / 2, label.y + label.height / 2, {
    fill: paint.node.text,
  });
  w.close();
}
