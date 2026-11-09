/**
 * The usecase layout's invariants (spec #517 T3, Testing Decisions), for the DDLT specs over
 * parser-produced graphs: core's `validateLayout` (no NaN, nothing outside the drawing, no two
 * boxes overlapping, members inside their boundary, ends at their own boxes, labels clear),
 * plus what is usecase's own: every graph node is its view's size, non-members keep out of a
 * boundary, a note sits beside its target, and each edge end lies on its node's drawn outline
 * (the oval of an oval use case, else the box).
 */
import { validateLayout, type LayoutModelNode, type Point } from '@mermaid-js/core/layout';
import { ovalLevel, ovalOf } from './clip.ts';
import type { UsecaseLayout } from './layout.ts';
import type { UsecaseEdgeView, UsecasePrepared } from './prepare.ts';

/** Core `validateLayout`'s slack, in px: how far a point may lie off an outline and count as on it. */
const SLACK = 0.5;

interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: b.x - b.width / 2,
  y0: b.y - b.height / 2,
  x1: b.x + b.width / 2,
  y1: b.y + b.height / 2,
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 - SLACK && b.x0 < a.x1 - SLACK && a.y0 < b.y1 - SLACK && b.y0 < a.y1 - SLACK;

/** Whether the segment from `a` to `b` runs through the inside of `r` (Liang–Barsky clipping). */
function crosses(a: Point, b: Point, r: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const inner = { x0: r.x0 + SLACK, y0: r.y0 + SLACK, x1: r.x1 - SLACK, y1: r.y1 - SLACK };
  for (const [p, q] of [
    [-dx, a.x - inner.x0],
    [dx, inner.x1 - a.x],
    [-dy, a.y - inner.y0],
    [dy, inner.y1 - a.y],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** On the box's outline, within the slack. */
function onBox(n: LayoutModelNode, p: Point): boolean {
  const r = rectOf(n);
  const inside =
    p.x >= r.x0 - SLACK && p.x <= r.x1 + SLACK && p.y >= r.y0 - SLACK && p.y <= r.y1 + SLACK;
  const at = (a: number, b: number) => Math.abs(a - b) <= SLACK;
  return inside && (at(p.x, r.x0) || at(p.x, r.x1) || at(p.y, r.y0) || at(p.y, r.y1));
}

/** On the oval the box holds, within the slack measured along the radius. */
function onOval(n: LayoutModelNode, p: Point): boolean {
  const o = ovalOf(n);
  const r = Math.sqrt(ovalLevel(o, p));
  const dist = Math.hypot(p.x - o.cx, p.y - o.cy);
  // `dist / r` is the radius in that direction; `|r − 1|` of it is how far off the oval p is.
  return dist === 0 ? false : Math.abs(r - 1) * (dist / r) <= SLACK;
}

const within = (r: Rect, frame: Rect): boolean =>
  r.x0 >= frame.x0 - SLACK &&
  r.y0 >= frame.y0 - SLACK &&
  r.x1 <= frame.x1 + SLACK &&
  r.y1 <= frame.y1 + SLACK;

/** The model's members sit inside their boundary; every other node keeps out of it. */
function boundaryProblems(layout: UsecaseLayout, prepared: UsecasePrepared): string[] {
  const out: string[] = [];
  const byModelId = new Map<string, string>();
  for (const v of prepared.nodes.values()) {
    if (v.kind === 'actor') byModelId.set(v.actor.id, v.id);
    else if (v.kind === 'usecase') byModelId.set(v.useCase.id, v.id);
  }
  for (const b of prepared.boundaries) {
    const box = layout.groups.get(b.id);
    if (!box) continue;
    const frame = rectOf(box);
    const members = new Set(b.boundary.members.map((m) => byModelId.get(m)));
    for (const v of prepared.nodes.values()) {
      const n = layout.nodes.get(v.id);
      if (!n) continue;
      const r = rectOf(n);
      if (!members.has(v.id)) {
        if (overlaps(r, frame))
          out.push(`'${v.id}' is inside boundary '${b.id}' but no member of it`);
      } else if (!within(r, frame))
        out.push(`member '${v.id}' lies outside its boundary '${b.id}'`);
    }
  }
  return out;
}

/** Each end on its node's drawn outline: the oval of an oval use case, else the box. */
function endProblems(
  layout: UsecaseLayout,
  prepared: UsecasePrepared,
  e: UsecaseEdgeView
): string[] {
  const out: string[] = [];
  const points = layout.edges.get(e.id)!.points;
  for (const [end, p] of [
    [e.source, points[0]!],
    [e.target, points[points.length - 1]!],
  ] as const) {
    const v = prepared.nodes.get(end);
    const n = layout.nodes.get(end);
    if (!v || !n) continue;
    const oval = v.kind === 'usecase' && v.shape === 'ellipse';
    if (!(oval ? onOval(n, p) : onBox(n, p)))
      out.push(`edge '${e.id}' does not meet the ${oval ? 'oval' : 'box'} of '${end}'`);
  }
  return out;
}

/**
 * A note beside its target: in the next rank over, with nothing drawn between, so the line
 * joining the two centres crosses no other node (a boundary frame it may: a note is never a
 * member).
 */
function noteProblems(layout: UsecaseLayout, e: UsecaseEdgeView): string[] {
  const out: string[] = [];
  const note = layout.nodes.get(e.source);
  const target = layout.nodes.get(e.target);
  if (!note || !target) return out;
  for (const [id, n] of layout.nodes) {
    if (id === e.source || id === e.target) continue;
    if (crosses(note, target, rectOf(n)))
      out.push(`note '${e.source}' has '${id}' between it and its target`);
  }
  return out;
}

/** Every problem with `layout` for its own graph; empty when it holds every invariant. */
export function usecaseLayoutProblems(layout: UsecaseLayout): string[] {
  const prepared = layout.usecase;
  if (!prepared) return ['no usecase views on the layout'];
  const { graph, nodes, edges } = prepared;
  const out = validateLayout(graph, layout);
  for (const g of graph.nodes) {
    const v = nodes.get(g.id);
    if (!v || v.width !== g.width || v.height !== g.height)
      out.push(`node '${g.id}': graph node differs from its view`);
  }
  out.push(...boundaryProblems(layout, prepared));
  const inGraph = new Set(graph.edges.map((g) => g.id));
  for (const e of edges) {
    if (!inGraph.has(e.id)) out.push(`edge '${e.id}': not in the graph`);
    const placed = layout.edges.get(e.id);
    if (!placed || placed.points.length < 2) {
      out.push(`edge '${e.id}': not routed`);
      continue;
    }
    out.push(...endProblems(layout, prepared, e));
    if (e.kind === 'note') out.push(...noteProblems(layout, e));
  }
  return out;
}
