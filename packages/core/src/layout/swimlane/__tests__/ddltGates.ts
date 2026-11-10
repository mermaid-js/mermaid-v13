// D538's swimlane gates, test helpers beside the engine (core's `validateLayout` is unchanged):
// v12's `edge-intersects-obstacle`, `edge-corner-connection`, `edge-border-hugging` and
// `node-border-hugging` checks, ported from `layout-utils/validateLayout.ts` at upstream
// `c9b12739f` with their constants, tolerances and messages. They read the `LayoutModel` and its
// `LayoutGraph` where v12 read its `LayoutData`: nodes and groups are the model's boxes, and each
// edge label is an obstacle the size the graph gives it, at the centre the model places it (v12's
// label node). The default lane counts as a lane.
import type { LayoutGraph, LayoutModel, Point } from '../../types.ts';

/** Distance threshold for corner connection check */
const EPS_CORNER = 3;
/** Distance threshold for border hugging detection */
const EPS_BORDER = 2;
/** Minimum near-border length to count as border hugging */
const L_MIN_BORDER = 12;
/** Exemption corridor near endpoints for certain checks */
const L_ATTACH = 8;
/** One rendered pixel is the tolerance boundary for layout geometry comparisons. */
const PIXEL_EPSILON = 1;
/** Floating-point slack in the obstacle test (v13 change, see `segmentIntersectsRectInterior`). */
const ROUNDING = 1e-6;

const DEFAULT_LANE = '__swimlane_default__';

type GateIssueType =
  | 'edge-intersects-obstacle'
  | 'edge-corner-connection'
  | 'edge-border-hugging'
  | 'node-border-hugging';

interface GateIssue {
  type: GateIssueType;
  message: string;
  nodeIds?: string[];
  edgeId?: string;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Segment {
  a: Point;
  b: Point;
  orientation: 'H' | 'V' | 'Z';
}

const rectOf = (b: { x: number; y: number; width: number; height: number }): Rect => ({
  left: b.x - b.width / 2,
  right: b.x + b.width / 2,
  top: b.y - b.height / 2,
  bottom: b.y + b.height / 2,
});

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

function segmentOrientation(a: Point, b: Point): 'H' | 'V' | 'Z' {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx <= PIXEL_EPSILON && dy <= PIXEL_EPSILON) return 'Z';
  if (dy <= PIXEL_EPSILON) return 'H';
  return 'V';
}

/** v12's `normalizePolyline` segments: zero-length ones dropped, collinear ones merged. */
function normalizedSegments(points: readonly Point[]): Segment[] {
  const raw: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i]!, points[i + 1]!];
    const orientation = segmentOrientation(a, b);
    if (orientation !== 'Z') raw.push({ a, b, orientation });
  }
  const out: Segment[] = [];
  for (const next of raw) {
    const cur = out.at(-1);
    const sameRow =
      cur?.orientation === 'H' &&
      next.orientation === 'H' &&
      Math.abs(cur.b.y - next.a.y) <= PIXEL_EPSILON &&
      Math.abs(cur.a.y - next.a.y) <= PIXEL_EPSILON;
    const sameColumn =
      cur?.orientation === 'V' &&
      next.orientation === 'V' &&
      Math.abs(cur.b.x - next.a.x) <= PIXEL_EPSILON &&
      Math.abs(cur.a.x - next.a.x) <= PIXEL_EPSILON;
    if (cur && (sameRow || sameColumn)) cur.b = next.b;
    else out.push({ ...next });
  }
  return out;
}

function minDistanceToCorners(p: Point, r: Rect): number {
  return Math.min(
    distance(p, { x: r.left, y: r.top }),
    distance(p, { x: r.right, y: r.top }),
    distance(p, { x: r.left, y: r.bottom }),
    distance(p, { x: r.right, y: r.bottom })
  );
}

function rangeOverlap(a1: number, a2: number, b1: number, b2: number): number {
  const lo = Math.max(Math.min(a1, a2), Math.min(b1, b2));
  const hi = Math.min(Math.max(a1, a2), Math.max(b1, b2));
  return Math.max(0, hi - lo);
}

/** How far a segment runs within `EPS_BORDER` of one of the rect's sides. */
function segmentBorderHugLength(seg: Segment, r: Rect): number {
  if (seg.orientation === 'Z') return 0;
  if (seg.orientation === 'H') {
    const y = seg.a.y;
    const near = Math.abs(y - r.top) <= EPS_BORDER || Math.abs(y - r.bottom) <= EPS_BORDER;
    return near ? rangeOverlap(seg.a.x, seg.b.x, r.left, r.right) : 0;
  }
  const x = seg.a.x;
  const near = Math.abs(x - r.left) <= EPS_BORDER || Math.abs(x - r.right) <= EPS_BORDER;
  return near ? rangeOverlap(seg.a.y, seg.b.y, r.top, r.bottom) : 0;
}

const withinAttachCorridor = (p: Point, ref: Point): boolean => distance(p, ref) <= L_ATTACH;

function segmentWithinSameAttachCorridor(a: Point, b: Point, start: Point, end: Point): boolean {
  return (
    (withinAttachCorridor(a, start) && withinAttachCorridor(b, start)) ||
    (withinAttachCorridor(a, end) && withinAttachCorridor(b, end))
  );
}

/**
 * v12's `segmentIntersectsRectInterior`: an axis-aligned segment meets the rect, a run along
 * its border included, so edges never run under or on another node. Changed: an overlap along
 * the segment must exceed `ROUNDING`, since v13's measured sizes are not whole pixels and a
 * segment that ends on a box's side can overshoot it by a rounding error.
 */
function segmentIntersectsRectInterior(a: Point, b: Point, rect: Rect): boolean {
  if (a.x === b.x && a.y === b.y) return false;
  if (a.y === b.y) {
    const crosses = a.y >= rect.top && a.y <= rect.bottom;
    const lo = Math.max(Math.min(a.x, b.x), rect.left);
    return crosses && lo < Math.min(Math.max(a.x, b.x), rect.right) - ROUNDING;
  }
  if (a.x === b.x) {
    const crosses = a.x >= rect.left && a.x <= rect.right;
    const lo = Math.max(Math.min(a.y, b.y), rect.top);
    return crosses && lo < Math.min(Math.max(a.y, b.y), rect.bottom) - ROUNDING;
  }
  return false;
}

function firstInteriorRectHit(points: readonly Point[], rect: Rect): number | undefined {
  const start = points[0]!;
  const end = points.at(-1)!;
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [points[i]!, points[i + 1]!];
    if (segmentWithinSameAttachCorridor(a, b, start, end)) continue;
    if (segmentIntersectsRectInterior(a, b, rect)) return i;
  }
  return undefined;
}

/** The boxes v12 checked: nodes and label nodes are obstacles, groups have borders. */
function boxes(graph: LayoutGraph, model: LayoutModel) {
  const obstacles = new Map<string, Rect>();
  const labelOf = new Map<string, string>();
  for (const n of graph.nodes) obstacles.set(n.id, rectOf(model.nodes.get(n.id)!));
  for (const e of graph.edges) {
    const at = model.edges.get(e.id)?.label;
    if (!e.label || !at) continue;
    const id = `edge-label-${e.id}`;
    obstacles.set(id, rectOf({ ...at, ...e.label }));
    labelOf.set(e.id, id);
  }
  const groups = new Map<string, Rect>();
  for (const [id, g] of model.groups) groups.set(id, rectOf(g));
  return { obstacles, labelOf, groups };
}

/** Whether `group` holds `id`, however deep; every loose node is in the default lane. */
function ancestry(graph: LayoutGraph): (group: string, id: string) => boolean {
  const parent = new Map<string, string | undefined>();
  for (const n of graph.nodes) parent.set(n.id, n.parent ?? DEFAULT_LANE);
  for (const g of graph.groups) parent.set(g.id, g.parent);
  return (group, id) => {
    const seen = new Set<string>();
    for (let p = parent.get(id); p !== undefined && !seen.has(p); p = parent.get(p)) {
      if (p === group) return true;
      seen.add(p);
    }
    return false;
  };
}

/** v12's node-vs-group border hugging: a node's side along a foreign group's (or its lane's) border. */
function nodeBorderHugging(
  graph: LayoutGraph,
  model: LayoutModel,
  groups: Map<string, Rect>,
  isAncestor: (group: string, id: string) => boolean
): GateIssue[] {
  const lanes = new Set([DEFAULT_LANE, ...graph.groups.filter((g) => !g.parent).map((g) => g.id)]);
  const issues: GateIssue[] = [];
  for (const n of graph.nodes) {
    const r = rectOf(model.nodes.get(n.id)!);
    const sides: Segment[] = [
      { a: { x: r.left, y: r.top }, b: { x: r.right, y: r.top }, orientation: 'H' },
      { a: { x: r.left, y: r.bottom }, b: { x: r.right, y: r.bottom }, orientation: 'H' },
      { a: { x: r.left, y: r.top }, b: { x: r.left, y: r.bottom }, orientation: 'V' },
      { a: { x: r.right, y: r.top }, b: { x: r.right, y: r.bottom }, orientation: 'V' },
    ];
    for (const [gId, gRect] of groups) {
      if (isAncestor(gId, n.id) && !lanes.has(gId)) continue;
      const hug = Math.max(...sides.map((s) => segmentBorderHugLength(s, gRect)));
      if (hug >= L_MIN_BORDER) {
        issues.push({
          type: 'node-border-hugging',
          message: `Node "${n.id}" hugs border of group "${gId}" for ${hug.toFixed(1)} units`,
          nodeIds: [n.id, gId],
        });
        break;
      }
    }
  }
  return issues;
}

/** v12's per-edge obstacle, corner and border-hugging checks for one edge. */
function edgeIssues(
  edgeId: string,
  ends: { source: string; target: string },
  points: readonly Point[],
  ctx: { boxes: ReturnType<typeof boxes>; model: LayoutModel }
): GateIssue[] {
  const { obstacles, labelOf, groups } = ctx.boxes;
  const issues: GateIssue[] = [];
  const own = labelOf.get(edgeId);
  for (const [id, rect] of obstacles) {
    if (id === own) continue;
    if (firstInteriorRectHit(points, rect) !== undefined) {
      issues.push({
        type: 'edge-intersects-obstacle',
        message: `Edge "${edgeId}" intersects obstacle "${id}"`,
        edgeId,
        nodeIds: [id],
      });
    }
  }
  const box = (id: string) => ctx.model.nodes.get(id) ?? ctx.model.groups.get(id);
  for (const [id, p] of [
    [ends.source, points[0]!],
    [ends.target, points.at(-1)!],
  ] as const) {
    const b = box(id);
    if (b && minDistanceToCorners(p, rectOf(b)) <= EPS_CORNER) {
      issues.push({
        type: 'edge-corner-connection',
        message: `Edge "${edgeId}" connects at corner of node "${id}"`,
        edgeId,
        nodeIds: [id],
      });
    }
  }
  const start = points[0]!;
  const end = points.at(-1)!;
  for (const [id, rect] of [...obstacles, ...groups]) {
    if (id === own) continue;
    for (const seg of normalizedSegments(points)) {
      if (segmentWithinSameAttachCorridor(seg.a, seg.b, start, end)) continue;
      const hug = segmentBorderHugLength(seg, rect);
      if (hug >= L_MIN_BORDER) {
        issues.push({
          type: 'edge-border-hugging',
          message: `Edge "${edgeId}" hugs border of node "${id}" for ${hug.toFixed(1)} units`,
          edgeId,
          nodeIds: [id],
        });
        break;
      }
    }
  }
  return issues;
}

/** Every D538 gate issue in `model`, in v12's order: node hugging, then each edge's. */
export function swimlaneGateIssues(graph: LayoutGraph, model: LayoutModel): GateIssue[] {
  const b = boxes(graph, model);
  const issues = nodeBorderHugging(graph, model, b.groups, ancestry(graph));
  for (const e of graph.edges) {
    const points = model.edges.get(e.id)?.points ?? [];
    if (points.length < 2) continue;
    issues.push(...edgeIssues(e.id, e, points, { boxes: b, model }));
  }
  return issues;
}
