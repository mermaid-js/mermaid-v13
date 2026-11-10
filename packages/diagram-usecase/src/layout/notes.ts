/**
 * Notes beside their target (spec #517 T3). v12 lays a note out through an internal edge one rank
 * long, from the note to its target, so the note sits in the rank before. An engine that lays a
 * boundary out as one block (`layered`, ELK) ranks that edge against the block: when another
 * member sits in the block's rank before the target, the note lands a rank or more away, next to
 * whatever is before the block. `placeNotes` then turns those notes' edges round (the target to
 * the note, the note in the rank after) and lays the graph out again, keeping the layout with
 * fewer notes away. `noteProblems` is what "beside" means, which the invariants check too.
 */
import type { LayoutModel, Point } from '@mermaid-js/core/layout';
import type { NoteEdgeView, UsecaseEdgeView, UsecasePrepared } from './prepare.ts';

/** Core `validateLayout`'s slack, in px: how far a point may lie off an outline and count as on it. */
export const SLACK = 0.5;

export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  x0: b.x - b.width / 2,
  y0: b.y - b.height / 2,
  x1: b.x + b.width / 2,
  y1: b.y + b.height / 2,
});

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

/**
 * What keeps a note from being beside its target, as v12 lays notes out (one rank apart):
 * - along the flow, another node lies wholly in the gap between them (it sits in a rank between);
 * - the line joining the two centres crosses another node (a boundary frame it may: a note is
 *   never a member).
 */
export function noteProblems(layout: LayoutModel, e: NoteEdgeView): string[] {
  const out: string[] = [];
  const id = e.note.astId;
  const other = e.source === id ? e.target : e.source;
  const note = layout.nodes.get(id);
  const target = layout.nodes.get(other);
  if (!note || !target) return out;
  const across = layout.direction === 'LR' || layout.direction === 'RL';
  const span = (r: Rect): [number, number] => (across ? [r.x0, r.x1] : [r.y0, r.y1]);
  const [n0, n1] = span(rectOf(note));
  const [t0, t1] = span(rectOf(target));
  const gap: [number, number] = [Math.min(n1, t1), Math.max(n0, t0)];
  for (const [nodeId, n] of layout.nodes) {
    if (nodeId === id || nodeId === other) continue;
    const r = rectOf(n);
    const [lo, hi] = span(r);
    if (gap[0] < gap[1] && lo >= gap[0] - SLACK && hi <= gap[1] + SLACK)
      out.push(`note '${id}' is a rank or more from its target: '${nodeId}' lies between`);
    if (crosses(note, target, r))
      out.push(`note '${id}' has '${nodeId}' between it and its target`);
  }
  return out;
}

/** The ids of the note edges whose note is not beside its target. */
function away(prepared: UsecasePrepared, layout: LayoutModel): Set<string> {
  const out = new Set<string>();
  for (const e of prepared.edges)
    if (e.kind === 'note' && noteProblems(layout, e).length > 0) out.add(e.id);
  return out;
}

/** `prepared` with the edges `ids` names running the other way, in the views and the graph. */
function turned(prepared: UsecasePrepared, ids: ReadonlySet<string>): UsecasePrepared {
  const turn = <E extends { id: string; source: string; target: string }>(e: E): E =>
    ids.has(e.id) ? { ...e, source: e.target, target: e.source } : e;
  return {
    ...prepared,
    edges: prepared.edges.map((e): UsecaseEdgeView => turn(e)),
    graph: { ...prepared.graph, edges: prepared.graph.edges.map(turn) },
  };
}

/**
 * Lays `prepared` out with `engine`; when a note lands away from its target, once more with
 * those notes after their target, keeping the second layout if fewer notes are away in it.
 */
export function placeNotes(
  prepared: UsecasePrepared,
  engine: (graph: UsecasePrepared['graph']) => LayoutModel
): { readonly prepared: UsecasePrepared; readonly laid: LayoutModel } {
  const laid = engine(prepared.graph);
  const first = away(prepared, laid);
  if (first.size === 0) return { prepared, laid };
  const again = turned(prepared, first);
  const relaid = engine(again.graph);
  return away(again, relaid).size < first.size
    ? { prepared: again, laid: relaid }
    : { prepared, laid };
}
