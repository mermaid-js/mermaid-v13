/**
 * The C4 layout's invariants (spec #522 "Testing Decisions", T3, R-LAYOUT-3): what every
 * `C4Layout` must satisfy for the model it was laid out from. `c4LayoutViolations` is empty when
 * the layout is sound; each entry names a broken rule: a number that is not finite; elements
 * that overlap, stand outside their boundary's frame (below its header) or overlap a frame they
 * are not in; a boundary outside its parent's; sibling boundaries that overlap; a header
 * outside its frame; a relation whose ends are not on its shapes' outlines; in a careful layout,
 * a label box not marked `crowded` over its own arrowheads, any element (#542) or another
 * relation's line (#522 final review); anything drawn outside the bounds, or the bounds outside
 * the canvas. `c4LayoutViolations` is exported from `@mermaid-js/diagram-c4/testing`.
 * `c4RelationCrossings` lists the relations that cross an element other than their own ends,
 * which the package's layout spec pins (the spec allows listed exceptions).
 */
import type { C4Model } from '../model.ts';
import { C4_METRICS as M } from './metrics.ts';
import { crosses, lineOf } from './route.ts';
import { onOutline, type Outline } from './shapes.ts';
import type { C4Layout, C4RelationLayout, Point, Rect } from './types.ts';

/** Float tolerance of the checks, in px. */
const EPS = 1e-6;
/** How far an end may lie off its outline, in px. */
const END_TOL = 0.01;

function finite(value: unknown, path: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${path} is ${value}`);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach((v, i) => finite(v, `${path}[${i}]`, out));
  else for (const [k, v] of Object.entries(value)) finite(v, `${path}.${k}`, out);
}

const inside = (outer: Rect, inner: Rect, top = outer.y): boolean =>
  inner.x >= outer.x - EPS &&
  inner.y >= top - EPS &&
  inner.x + inner.width <= outer.x + outer.width + EPS &&
  inner.y + inner.height <= outer.y + outer.height + EPS;

const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - EPS &&
  b.x < a.x + a.width - EPS &&
  a.y < b.y + b.height - EPS &&
  b.y < a.y + a.height - EPS;

/** Pairs of boxes that overlap, by a sweep along x. */
function overlapping<T>(items: readonly T[], box: (t: T) => Rect): [T, T][] {
  const sorted = [...items].sort((a, b) => box(a).x - box(b).x);
  const out: [T, T][] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = box(sorted[i]!);
    for (let j = i + 1; j < sorted.length; j++) {
      const b = box(sorted[j]!);
      if (b.x >= a.x + a.width - EPS) break;
      if (overlap(a, b)) out.push([sorted[i]!, sorted[j]!]);
    }
  }
  return out;
}

/** The outline a relation end names: an element first, then a boundary (v12 `getC4Shape`). */
function endBoxes(layout: C4Layout): (alias: string) => Outline | undefined {
  const elements = new Map<string, Outline>();
  for (const e of layout.elements)
    if (!elements.has(e.alias)) elements.set(e.alias, { ...e.box, form: e.shape });
  const frames = new Map<string, Outline>();
  for (const b of layout.boundaries)
    if (!frames.has(b.alias)) frames.set(b.alias, { ...b.box, form: 'frame' });
  return (alias) => elements.get(alias) ?? frames.get(alias);
}

const flat = (points: readonly Point[]): number[] => points.flatMap((p) => [p.x, p.y]);

/** The box a self-loop's curve stays in: its ends and control points. */
function hull(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function c4LayoutViolations(model: C4Model, layout: C4Layout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  if (out.length > 0) return out;
  checkElements(model, layout, out);
  checkBoundaries(model, layout, out);
  checkRelations(model, layout, out);
  if (layout.careful) checkLabels(layout, out);
  checkBounds(layout, out);
  return out;
}

function checkElements(model: C4Model, layout: C4Layout, out: string[]): void {
  if (layout.elements.length !== model.elements.length)
    out.push(`drawn elements ${layout.elements.length}, model elements ${model.elements.length}`);
  const frames = new Map(layout.boundaries.map((b) => [b.index, b]));
  for (const e of layout.elements) {
    if (!(e.box.width > 0 && e.box.height > 0)) out.push(`element ${e.alias} has no area`);
    const parent = model.elements[e.index]?.parent ?? -1;
    if (parent >= 0) {
      const frame = frames.get(parent);
      if (!frame) out.push(`element ${e.alias}: its boundary is not drawn`);
      else if (!inside(frame.box, e.box, frame.box.y + frame.head))
        out.push(`element ${e.alias} is outside boundary ${frame.alias}`);
    }
    for (const s of [e.name, e.type, e.descr])
      if (s && !inside(e.box, s)) out.push(`element ${e.alias}: its text is outside its shape`);
  }
  for (const [a, b] of overlapping(layout.elements, (e) => e.box))
    out.push(`elements ${a.alias} and ${b.alias} overlap`);
  checkForeignFrames(model, layout, out);
}

/** The drawn boundaries holding boundary `index`, itself included, through the drawn parents. */
function ancestors(layout: C4Layout, index: number): Set<number> {
  const parentOf = new Map(layout.boundaries.map((b) => [b.index, b.parent]));
  const out = new Set<number>();
  for (let at = index; at >= 0 && !out.has(at); at = parentOf.get(at) ?? -1) out.add(at);
  return out;
}

/** An element against every frame it is not in: they must not overlap. */
function checkForeignFrames(model: C4Model, layout: C4Layout, out: string[]): void {
  for (const e of layout.elements) {
    const own = ancestors(layout, model.elements[e.index]?.parent ?? -1);
    for (const b of layout.boundaries)
      if (!own.has(b.index) && overlap(b.box, e.box))
        out.push(`element ${e.alias} overlaps boundary ${b.alias}, which it is not in`);
  }
}

function checkBoundaries(model: C4Model, layout: C4Layout, out: string[]): void {
  if (layout.boundaries.length !== model.boundaries.length)
    out.push(
      `drawn boundaries ${layout.boundaries.length}, model boundaries ${model.boundaries.length}`
    );
  const byIndex = new Map(layout.boundaries.map((b) => [b.index, b]));
  const siblings = new Map<number, typeof layout.boundaries>();
  for (const b of layout.boundaries) {
    if (!(b.box.width > 0 && b.box.height > 0)) out.push(`boundary ${b.alias} has no area`);
    for (const s of [b.label, b.type, b.descr])
      if (s && !inside({ ...b.box, height: Math.min(b.head, b.box.height) }, s))
        out.push(`boundary ${b.alias}: its header is outside its frame`);
    if (b.head > b.box.height + EPS)
      out.push(`boundary ${b.alias}: its header is taller than its frame`);
    if (b.parent >= 0) {
      const parent = byIndex.get(b.parent);
      if (!parent) out.push(`boundary ${b.alias}: its parent is not drawn`);
      else if (!inside(parent.box, b.box, parent.box.y + parent.head))
        out.push(`boundary ${b.alias} is outside boundary ${parent.alias}`);
      if (model.boundaries[b.index]?.parent !== b.parent)
        out.push(`boundary ${b.alias}: drawn in another parent than the model's (not a cycle)`);
    }
    siblings.set(b.parent, [...(siblings.get(b.parent) ?? []), b]);
  }
  for (const list of siblings.values())
    for (const [a, b] of overlapping(list, (x) => x.box))
      out.push(`boundaries ${a.alias} and ${b.alias} overlap`);
}

function checkRelations(model: C4Model, layout: C4Layout, out: string[]): void {
  const endOf = endBoxes(layout);
  const drawable = model.relations.filter((r) => endOf(r.from) && endOf(r.to)).length;
  if (layout.relations.length !== drawable)
    out.push(`drawn relations ${layout.relations.length}, relations with known ends ${drawable}`);
  for (const r of layout.relations) {
    const a = endOf(r.from);
    const b = endOf(r.to);
    const name = `relation ${r.from} -> ${r.to}`;
    if (!a || !b) {
      out.push(`${name}: an end is not drawn`);
      continue;
    }
    if (r.points.length < 2) out.push(`${name}: fewer than two points`);
    if (!onOutline(a, r.start, END_TOL))
      out.push(`${name}: its start is not on the outline of ${r.from}`);
    if (!onOutline(b, r.end, END_TOL))
      out.push(`${name}: its end is not on the outline of ${r.to}`);
    if (r.route === 'bent')
      for (let i = 1; i < r.points.length; i++) {
        const p = r.points[i - 1]!;
        const q = r.points[i]!;
        if (Math.abs(p.x - q.x) > EPS && Math.abs(p.y - q.y) > EPS)
          out.push(`${name}: a bent stretch is slanted`);
      }
  }
}

/** The polyline a relation's label box is checked against (`lineOf`), as x, y pairs. */
const lineOfLayout = (r: C4RelationLayout): number[] =>
  lineOf(flat(r.points), r.controls ? flat(r.controls) : undefined);

/**
 * In a careful layout, no label box covers its own arrowheads, any element or another
 * relation's line, unless the layout marks it `crowded` (no spot cleared them).
 */
function checkLabels(layout: C4Layout, out: string[]): void {
  const square = (p: Point): Rect => ({
    x: p.x - M.arrow,
    y: p.y - M.arrow,
    width: 2 * M.arrow,
    height: 2 * M.arrow,
  });
  const lines = new Map(layout.relations.map((r) => [r.index, lineOfLayout(r)]));
  const byIndex = new Map(layout.relations.map((r) => [r.index, `${r.from} -> ${r.to}`]));
  for (const r of layout.relations) {
    const box = r.labelBox;
    if (!box || r.crowded) continue;
    const name = `relation ${r.from} -> ${r.to}`;
    if (
      (r.startArrow && overlap(box, square(r.start))) ||
      (r.endArrow && overlap(box, square(r.end)))
    )
      out.push(`${name}: its label covers its own arrowhead`);
    for (const e of layout.elements)
      if (overlap(box, e.box)) out.push(`${name}: its label covers element ${e.alias}`);
    // The box less the tolerance: a line along its edge does not run through it.
    const inner = {
      x0: box.x + EPS,
      y0: box.y + EPS,
      x1: box.x + box.width - EPS,
      y1: box.y + box.height - EPS,
    };
    for (const [k, o] of lines.entries())
      if (k !== r.index && crosses(o, inner))
        out.push(`${name}: its label is over the line of relation ${byIndex.get(k)}`);
  }
}

/** Everything a relation draws: its line or loop, and its label box. */
function relationBoxes(r: C4RelationLayout): Rect[] {
  const boxes = [hull([...r.points, ...(r.controls ?? [])])];
  for (const l of [r.label, r.techn]) if (l) boxes.push(l);
  return boxes;
}

function checkBounds(layout: C4Layout, out: string[]): void {
  const { bounds } = layout;
  const drawn: [string, Rect][] = [
    ...layout.elements.map((e): [string, Rect] => [`element ${e.alias}`, e.box]),
    ...layout.boundaries.map((b): [string, Rect] => [`boundary ${b.alias}`, b.box]),
    ...layout.relations.flatMap((r) =>
      relationBoxes(r).map((box): [string, Rect] => [`relation ${r.from} -> ${r.to}`, box])
    ),
    ...(layout.title ? [['the title', layout.title] as [string, Rect]] : []),
  ];
  for (const [name, box] of drawn)
    if (!inside(bounds, box)) out.push(`${name} is outside the bounds`);
  if (!inside({ x: 0, y: 0, width: layout.width, height: layout.height }, bounds))
    out.push('the bounds are outside the canvas');
}

/**
 * The relations that cross an element other than their own ends (by its box), as
 * `from -> to crosses alias`; a self-loop by the box its curve stays in.
 */
export function c4RelationCrossings(layout: C4Layout): string[] {
  const out: string[] = [];
  for (const r of layout.relations) {
    const pts = r.route === 'loop' ? [] : flat(r.points);
    const loop = r.route === 'loop' ? hull([...r.points, ...(r.controls ?? [])]) : undefined;
    for (const e of layout.elements) {
      if (e.alias === r.from || e.alias === r.to) continue;
      const { x, y, width, height } = e.box;
      const hitIt = loop
        ? overlap(loop, e.box)
        : crosses(pts, { x0: x, y0: y, x1: x + width, y1: y + height });
      if (hitIt) out.push(`${r.from} -> ${r.to} crosses ${e.alias}`);
    }
  }
  return out;
}
