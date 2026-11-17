// Engine-agnostic checks on a LayoutModel, for DDLT-style tests of any layout engine: every
// coordinate finite, everything placed inside the drawing, no boxes overlapping, groups holding
// their members, and edges starting and ending at their own boxes (or, for a `border` end on a
// node, on the border of the node's group). `countCrossings` gives a
// quality number to record per fixture.
import type { LayoutGraph, LayoutModel, Point } from './types.ts';

// How far apart two boxes may overlap, or a point may lie off a box, and still count as clear.
const SLACK = 0.5;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function rect(b: { x: number; y: number; width: number; height: number }): Rect {
  return {
    x0: b.x - b.width / 2,
    y0: b.y - b.height / 2,
    x1: b.x + b.width / 2,
    y1: b.y + b.height / 2,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 - SLACK && b.x0 < a.x1 - SLACK && a.y0 < b.y1 - SLACK && b.y0 < a.y1 - SLACK;
}

function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x0 >= outer.x0 - SLACK &&
    inner.y0 >= outer.y0 - SLACK &&
    inner.x1 <= outer.x1 + SLACK &&
    inner.y1 <= outer.y1 + SLACK
  );
}

function near(r: Rect, p: Point): boolean {
  return p.x >= r.x0 - SLACK && p.x <= r.x1 + SLACK && p.y >= r.y0 - SLACK && p.y <= r.y1 + SLACK;
}

function onBorder(r: Rect, p: Point): boolean {
  const at = (a: number, b: number): boolean => Math.abs(a - b) <= SLACK;
  return near(r, p) && (at(p.x, r.x0) || at(p.x, r.x1) || at(p.y, r.y0) || at(p.y, r.y1));
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the invariant checks share: the findings so far, and the placed boxes. */
interface Check {
  readonly graph: LayoutGraph;
  readonly model: LayoutModel;
  readonly problems: string[];
  readonly page: Rect;
  readonly boxes: Map<string, Rect>;
  readonly parent: Map<string, string | undefined>;
  readonly groupIds: Set<string>;
}

interface PlacedLabel {
  edge: string;
  name: string;
  r: Rect;
}

const bad = (v: number): boolean => !Number.isFinite(v);

function checkDrawingSize(c: Check): void {
  const { width, height } = c.model;
  if (bad(width) || bad(height) || width < 0 || height < 0) {
    c.problems.push(`drawing width/height not finite: ${width} x ${height}`);
  }
}

// Records the box of a node or group, with the group it sits in.
function place(
  c: Check,
  kind: string,
  id: string,
  b: Box | undefined,
  up: string | undefined
): void {
  if (!b) {
    c.problems.push(`missing ${kind} '${id}'`);
    return;
  }
  if ([b.x, b.y, b.width, b.height].some(bad)) {
    c.problems.push(`${kind} '${id}' has a non-finite coordinate`);
    return;
  }
  const r = rect(b);
  if (!contains(c.page, r)) c.problems.push(`${kind} '${id}' lies outside the drawing`);
  c.boxes.set(id, r);
  c.parent.set(id, up);
}

function checkBoxes(c: Check): void {
  for (const n of c.graph.nodes) place(c, 'node', n.id, c.model.nodes.get(n.id), n.parent);
  for (const g of c.graph.groups) {
    const placed = c.model.groups.get(g.id);
    place(c, 'group', g.id, placed, g.parent);
    if (placed && (bad(placed.title.x) || bad(placed.title.y))) {
      c.problems.push(`group '${g.id}' title has a non-finite coordinate`);
    }
  }
}

function ancestors(c: Check, id: string): Set<string> {
  const out = new Set<string>();
  for (
    let p = c.parent.get(id);
    p !== undefined && c.groupIds.has(p) && !out.has(p);
    p = c.parent.get(p)
  ) {
    out.add(p);
  }
  return out;
}

// Groups hold their members; boxes that are not nested in one another do not overlap.
function checkNesting(c: Check): void {
  const ids = [...c.boxes.keys()];
  const chains = new Map(ids.map((id) => [id, ancestors(c, id)]));
  for (const id of ids) {
    for (const g of chains.get(id)!) {
      if (!contains(c.boxes.get(g)!, c.boxes.get(id)!))
        c.problems.push(`'${id}' lies outside its group '${g}'`);
    }
  }
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (chains.get(a)!.has(b) || chains.get(b)!.has(a)) continue;
      if (overlaps(c.boxes.get(a)!, c.boxes.get(b)!)) c.problems.push(`'${a}' and '${b}' overlap`);
    }
  }
}

const badPoint = (p: Point | undefined): boolean => !!p && (bad(p.x) || bad(p.y));

// An edge is placed, finite, of two points or more and inside the drawing; false when the
// first of these it fails ends the edge's checks.
function checkEdgeShape(c: Check, e: LayoutGraph['edges'][number]): boolean {
  const placed = c.model.edges.get(e.id);
  if (!placed) {
    c.problems.push(`missing edge '${e.id}'`);
    return false;
  }
  if (
    placed.points.some(badPoint) ||
    [placed.label, placed.startLabel, placed.endLabel].some(badPoint)
  ) {
    c.problems.push(`edge '${e.id}' has a non-finite coordinate`);
    return false;
  }
  if (placed.points.length < 2) {
    c.problems.push(`edge '${e.id}' has fewer than two points`);
    return false;
  }
  for (const p of placed.points) {
    if (!near(c.page, p)) {
      c.problems.push(`edge '${e.id}' runs outside the drawing`);
      break;
    }
  }
  return true;
}

// An end meets its own box. A `border` end on a node (D501) meets the border of the group
// the node sits in instead: on that box's boundary, not anywhere inside it.
function meets(c: Check, id: string, border: boolean | undefined, p: Point): boolean {
  const up = border && !c.groupIds.has(id) ? c.parent.get(id) : undefined;
  const group = up !== undefined && c.groupIds.has(up) ? c.boxes.get(up) : undefined;
  if (group) return onBorder(group, p);
  const own = c.boxes.get(id);
  return !own || near(own, p);
}

function checkEdgeEnds(c: Check, e: LayoutGraph['edges'][number]): void {
  const points = c.model.edges.get(e.id)!.points;
  if (!meets(c, e.source, e.border?.source, points[0]!))
    c.problems.push(`edge '${e.id}' does not start at its source`);
  if (!meets(c, e.target, e.border?.target, points[points.length - 1]!))
    c.problems.push(`edge '${e.id}' does not end at its target`);
}

// The middle label, then the end labels (D102), which also keep clear of the edge's others.
function checkEdgeLabels(
  c: Check,
  e: LayoutGraph['edges'][number],
  placedLabels: PlacedLabel[]
): void {
  const placed = c.model.edges.get(e.id)!;
  const labels: [string, Rect][] = [];
  for (const [name, size, at] of [
    ['label', e.label, placed.label],
    ['start label', e.startLabel, placed.startLabel],
    ['end label', e.endLabel, placed.endLabel],
  ] as const) {
    if (!size) continue;
    if (!at) {
      c.problems.push(`edge '${e.id}' has a ${name} but no ${name} position`);
      continue;
    }
    const r = rect({ ...at, ...size });
    for (const n of c.graph.nodes) {
      const b = c.boxes.get(n.id);
      if (b && overlaps(r, b)) c.problems.push(`${name} of edge '${e.id}' overlaps node '${n.id}'`);
    }
    for (const [other, o] of labels) {
      if (overlaps(r, o)) c.problems.push(`${name} of edge '${e.id}' overlaps its ${other}`);
    }
    labels.push([name, r]);
    placedLabels.push({ edge: e.id, name, r });
  }
}

// An end label (D102) keeps clear of the labels of every other edge too.
function checkLabelClashes(c: Check, placedLabels: PlacedLabel[]): void {
  for (let j = 0; j < placedLabels.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = placedLabels[j]!;
      const b = placedLabels[i]!;
      if (a.edge === b.edge || (a.name === 'label' && b.name === 'label')) continue;
      if (!overlaps(a.r, b.r)) continue;
      const [x, y] = a.name === 'label' ? [b, a] : [a, b];
      c.problems.push(`${x.name} of edge '${x.edge}' overlaps ${y.name} of edge '${y.edge}'`);
    }
  }
}

/** Returns one message per problem; an empty list means the model is valid for the graph. */
export function validateLayout(graph: LayoutGraph, model: LayoutModel): string[] {
  const c: Check = {
    graph,
    model,
    problems: [],
    page: { x0: 0, y0: 0, x1: model.width, y1: model.height },
    // Boxes by id, with the group each sits in.
    boxes: new Map(),
    parent: new Map(),
    groupIds: new Set(graph.groups.map((g) => g.id)),
  };
  checkDrawingSize(c);
  checkBoxes(c);
  checkNesting(c);
  // Every placed label, for the check that end labels keep clear of other edges' labels.
  const placedLabels: PlacedLabel[] = [];
  for (const e of graph.edges) {
    if (!checkEdgeShape(c, e)) continue;
    checkEdgeEnds(c, e);
    checkEdgeLabels(c, e, placedLabels);
  }
  checkLabelClashes(c, placedLabels);
  return c.problems;
}

function cross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < SLACK && Math.abs(a.y - b.y) < SLACK;
}

/**
 * Counts pairs of edges whose routes, taken as polylines, properly cross. Edges that share an
 * end point are not compared, since they fan out of one place. Each pair counts once.
 */
export function countCrossings(model: LayoutModel): number {
  const routes = [...model.edges.values()].map((e) => e.points).filter((p) => p.length >= 2);
  let count = 0;
  for (let i = 0; i < routes.length; i++) {
    const a = routes[i]!;
    for (let j = i + 1; j < routes.length; j++) {
      const b = routes[j]!;
      const ends = [a[0]!, a[a.length - 1]!];
      if (ends.some((p) => same(p, b[0]!) || same(p, b[b.length - 1]!))) continue;
      let hit = false;
      for (let s = 0; s + 1 < a.length && !hit; s++) {
        for (let t = 0; t + 1 < b.length && !hit; t++)
          hit = cross(a[s]!, a[s + 1]!, b[t]!, b[t + 1]!);
      }
      if (hit) count++;
    }
  }
  return count;
}
