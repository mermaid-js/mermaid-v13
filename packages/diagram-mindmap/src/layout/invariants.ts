/**
 * Checks on a mindmap layout beyond core's `validateLayout` (DDLT), shared by the package's
 * specs and the parser-produced corpus spec in conformance (`@mermaid-js/diagram-mindmap/testing`):
 * each node's label and icon slot fit its shape, a cloud's or bang's box is its outline's, the
 * graph carries the views' sizes, and, for `tree`, the two-sided tree's own rules.
 */
import type { LayoutGraph, LayoutModel } from '@mermaid-js/core/layout';
import type { MindmapLayout } from './layout.ts';
import { outlineBox } from './outline.ts';
import type { MindmapNodeView } from './prepare.ts';

// Floating-point noise, not a length.
const EPS = 1e-6;

/** A `w` × `h` box centred at `at` lies inside a `fw` × `fh` box centred at 0. */
const inside = (at: { x: number; y: number }, w: number, h: number, fw: number, fh: number) =>
  Math.abs(at.x) + w / 2 <= fw / 2 + EPS && Math.abs(at.y) + h / 2 <= fh / 2 + EPS;

function viewProblems(v: MindmapNodeView): string[] {
  const out: string[] = [];
  const where = `node '${v.id}'`;
  const { width: fw, height: fh } = v.frame;
  const nums = [v.width, v.height, fw, fh, v.frame.dx, v.frame.dy, v.labelAt.x, v.labelAt.y];
  if (!nums.every(Number.isFinite)) return [`${where}: non-finite size`];
  const lw = v.label.width;
  const lh = v.label.height;
  if (v.shape === 'circle') {
    const r = fw / 2;
    if (Math.abs(fw - fh) > EPS) out.push(`${where}: a circle that is not round`);
    const far = Math.hypot(Math.abs(v.labelAt.x) + lw / 2, Math.abs(v.labelAt.y) + lh / 2);
    if (far > r + EPS) out.push(`${where}: label outside the circle`);
    if (v.icon && Math.abs(v.icon.at.y) + v.icon.glyph / 2 > r + EPS)
      out.push(`${where}: icon outside the circle`);
  } else {
    const inner = fw - 2 * (v.point ?? 0);
    if (!inside(v.labelAt, lw, lh, inner, fh)) out.push(`${where}: label outside its shape`);
    if (v.icon && !inside(v.icon.at, v.icon.slot, v.icon.glyph, inner, fh))
      out.push(`${where}: icon slot outside its shape`);
  }
  if (v.icon && !(v.shape === 'circle' ? v.icon.at.y < v.labelAt.y : v.icon.at.x < v.labelAt.x))
    out.push(`${where}: icon not ${v.shape === 'circle' ? 'above' : 'left of'} the label`);
  if (v.outline) {
    const b = outlineBox(v.outline);
    const fit =
      Math.abs(b.x1 - b.x0 - v.width) < EPS &&
      Math.abs(b.y1 - b.y0 - v.height) < EPS &&
      Math.abs((b.x0 + b.x1) / 2 + v.frame.dx) < EPS &&
      Math.abs((b.y0 + b.y1) / 2 + v.frame.dy) < EPS;
    if (!fit) out.push(`${where}: box is not its outline's`);
  } else if (!inside({ x: v.frame.dx, y: v.frame.dy }, fw, fh, v.width, v.height)) {
    out.push(`${where}: frame outside the box`);
  }
  return out;
}

/** Problems with the views and how they reached the engine and came back. */
export function mindmapProblems(layout: MindmapLayout): string[] {
  const out: string[] = [];
  const { graph, nodes, edges } = layout.mindmap;
  for (const [i, v] of nodes.entries()) {
    out.push(...viewProblems(v));
    const g = graph.nodes[i];
    if (!g || g.id !== v.id || g.width !== v.width || g.height !== v.height)
      out.push(`node '${v.id}': graph node differs from its view`);
    if (!layout.nodes.has(v.id)) out.push(`node '${v.id}': not laid out`);
  }
  for (const e of edges) {
    const m = layout.edges.get(e.id);
    if (!m || m.points.length < 2) out.push(`edge '${e.id}': not routed`);
  }
  return out;
}

/**
 * `tree`'s own rules (copied from core's `tree.ddlt.spec.ts`): the root centred on each side, the
 * first branches right, every node further out than its parent, parents centred on their first
 * and last child.
 */
export function treeProblems(graph: LayoutGraph, model: LayoutModel): string[] {
  const problems: string[] = [];
  const kids = new Map<string, string[]>();
  const parented = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === e.target || parented.has(e.target)) continue;
    parented.add(e.target);
    kids.set(e.source, [...(kids.get(e.source) ?? []), e.target]);
  }
  if (graph.nodes.length === 0) return problems;
  const at = (id: string) => model.nodes.get(id)!;
  const near = (a: number, b: number) => Math.abs(a - b) < EPS;
  const root = at(graph.nodes[0]!.id);
  const branches = kids.get(graph.nodes[0]!.id) ?? [];
  const right = branches.filter((b) => at(b).x > root.x);
  const left = branches.filter((b) => at(b).x < root.x);
  if (right.length + left.length !== branches.length)
    problems.push('a branch is level with the root');
  if (branches.slice(0, right.length).some((b) => !right.includes(b)))
    problems.push('the right side is not the first branches');
  for (const side of [right, left]) {
    if (side.length === 0) continue;
    const mid = (at(side[0]!).y + at(side.at(-1)!).y) / 2;
    if (!near(mid, root.y)) problems.push(`root not centred on a side: ${root.y} vs ${mid}`);
  }
  const stack = branches.map((b) => [b, at(b).x > root.x ? 1 : -1] as const);
  while (stack.length > 0) {
    const [id, dir] = stack.pop()!;
    const c = kids.get(id) ?? [];
    for (const k of c) {
      if ((at(k).x - at(id).x) * dir <= 0) problems.push(`'${k}' is not further out than '${id}'`);
      stack.push([k, dir]);
    }
    if (c.length > 0 && !near(at(id).y, (at(c[0]!).y + at(c.at(-1)!).y) / 2))
      problems.push(`'${id}' is not centred on its children`);
  }
  return problems;
}
