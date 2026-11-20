/**
 * The C4 layout's invariants (spec #522 "Testing Decisions", T3, R-LAYOUT-3): what every
 * `C4Layout` must satisfy for the model it was laid out from. `c4LayoutViolations` is empty when
 * the layout is sound; each entry names a broken rule: a number that is not finite; elements
 * that overlap, stand outside their boundary's frame (below its header) or overlap a frame they
 * are not in; a boundary outside its parent's; sibling boundaries that overlap; a header
 * outside its frame; a relation whose ends are not on its shapes' outlines, or that ends on a
 * person's head beside its body (D679); in a careful layout,
 * a label box not marked `crowded` over its own arrowheads, any element (#542) or another
 * relation's line (#522 final review); anything drawn outside the bounds, or the bounds outside
 * the canvas. `c4LayoutViolations` is exported from `@mermaid-js/diagram-c4/testing`.
 * `c4RelationCrossings` lists the relations that cross an element other than their own ends,
 * which the package's layout spec pins (the spec allows listed exceptions).
 */
import type { C4Model } from '../model.ts';
import { C4_METRICS as M } from './metrics.ts';
import { crosses, lineOf } from './route.ts';
import { labelBlockers, onOutline, outlineForm, personParts, type Outline } from './shapes.ts';
import type { C4Layout, C4RelationLayout, Point, Rect } from './types.ts';
import {
  EPS,
  nonFinite as finite,
  rectInside,
  rectsOverlap as overlap,
} from '@mermaid-js/shared/testing/layout-invariants';

/** How far an end may lie off its outline, in px. */
const END_TOL = 0.01;

/** Whether `inner` lies in `outer`, from `top` down (a frame below its header). */
const inside = (outer: Rect, inner: Rect, top = outer.y): boolean =>
  rectInside(
    inner,
    top === outer.y ? outer : { ...outer, y: top, height: outer.y + outer.height - top }
  );

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
  const cell = layout.cell !== undefined;
  for (const e of layout.elements)
    if (!elements.has(e.alias))
      elements.set(e.alias, { ...e.box, form: outlineForm(e.shape, cell) });
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
  checkPersonEnds(layout, out);
  if (layout.careful) checkLabels(layout, out);
  checkBounds(layout, out);
  out.push(...legendViolations(layout));
  return out;
}

function checkElements(model: C4Model, layout: C4Layout, out: string[]): void {
  if (layout.elements.length !== model.elements.length)
    out.push(`drawn elements ${layout.elements.length}, model elements ${model.elements.length}`);
  const frames = new Map(layout.boundaries.map((b) => [b.index, b]));
  for (const e of layout.elements) {
    if (!(e.box.width > 0 && e.box.height > 0)) out.push(`element ${e.alias} has no area`);
    checkInFrame(e, model.elements[e.index]?.parent ?? -1, frames, out);
    for (const s of [e.name, e.type, e.descr])
      if (s && !inside(e.box, s)) out.push(`element ${e.alias}: its text is outside its shape`);
  }
  for (const [a, b] of overlapping(layout.elements, (e) => e.box))
    out.push(`elements ${a.alias} and ${b.alias} overlap`);
  checkForeignFrames(model, layout, out);
}

/** An element in a boundary (`parent`, -1 for none): that boundary is drawn and holds it. */
function checkInFrame(
  e: C4Layout['elements'][number],
  parent: number,
  frames: ReadonlyMap<number, C4Layout['boundaries'][number]>,
  out: string[]
): void {
  if (parent < 0) return;
  const frame = frames.get(parent);
  if (!frame) out.push(`element ${e.alias}: its boundary is not drawn`);
  else if (!inside(frame.box, e.box, frame.box.y + frame.head))
    out.push(`element ${e.alias} is outside boundary ${frame.alias}`);
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

/**
 * D679: a relation beside a person ends on its body. An end on the head (above the body's top)
 * that leaves sideways, where the shape at the other end is beside the person and level with
 * some of its body, is a fault: that line could have reached the body. A line that leaves the
 * head upwards (round something in the way) is not. A person on the cell profile is a box.
 */
function checkPersonEnds(layout: C4Layout, out: string[]): void {
  if (layout.cell !== undefined) return;
  const endOf = endBoxes(layout);
  for (const r of layout.relations) {
    if (r.from === r.to) continue;
    const n = r.points.length;
    const ends: [string, Point, Point, string][] = [
      [r.from, r.points[0]!, r.points[1]!, r.to],
      [r.to, r.points[n - 1]!, r.points[n - 2]!, r.from],
    ];
    for (const [alias, at, next, other] of ends)
      if (headEnd(endOf(alias), [at, next], endOf(other)))
        out.push(`relation ${r.from} -> ${r.to}: it ends on the head of ${alias}`);
  }
}

/**
 * Whether the stretch from `at` (towards `next`) leaves `person`'s head sideways while `other`
 * stands beside it, level with its body.
 */
function headEnd(
  person: Outline | undefined,
  [at, next]: readonly [Point, Point],
  other: Outline | undefined
): boolean {
  if (person?.form !== 'person' || !other) return false;
  const { body } = personParts(person);
  const sideways = Math.abs(next.x - at.x) > Math.abs(next.y - at.y);
  return at.y < body.y - EPS && sideways && besideBody(person, body, other);
}

/** Whether `other` stands beside `person`, level with some of its `body`. */
function besideBody(person: Rect, body: Rect, other: Rect): boolean {
  const beside = other.x >= person.x + person.width || other.x + other.width <= person.x;
  return beside && other.y < body.y + body.height && other.y + other.height > body.y;
}

/** The polyline a relation's label box is checked against (`lineOf`), as x, y pairs. */
const lineOfLayout = (r: C4RelationLayout): number[] =>
  lineOf(flat(r.points), r.controls ? flat(r.controls) : undefined);

/**
 * In a careful layout, no label box covers its own arrowheads, any element (a person's head or
 * body: the corners of its box beside the head are empty), another relation's line or another
 * relation's label, unless the layout marks it `crowded` (no spot cleared them).
 */
function checkLabels(layout: C4Layout, out: string[]): void {
  const square = (p: Point): Rect => ({
    x: p.x - M.arrow,
    y: p.y - M.arrow,
    width: 2 * M.arrow,
    height: 2 * M.arrow,
  });
  const cell = layout.cell !== undefined;
  const blockers = layout.elements.map((e) => ({
    alias: e.alias,
    parts: labelBlockers({ ...e.box, form: outlineForm(e.shape, cell) }),
  }));
  const others = otherRelations(layout);
  for (const r of layout.relations) {
    const box = r.labelBox;
    if (!box || r.crowded) continue;
    const name = `relation ${r.from} -> ${r.to}`;
    if (
      (r.startArrow && overlap(box, square(r.start))) ||
      (r.endArrow && overlap(box, square(r.end)))
    )
      out.push(`${name}: its label covers its own arrowhead`);
    for (const e of blockers)
      if (e.parts.some((part) => overlap(box, part)))
        out.push(`${name}: its label covers element ${e.alias}`);
    for (const fault of others(r, box)) out.push(`${name}: ${fault}`);
  }
}

/**
 * What of the other relations a label box covers: their labels not marked `crowded` (a crowded
 * label over this one is the one excused), and their lines.
 */
function otherRelations(layout: C4Layout): (r: C4RelationLayout, box: Rect) => string[] {
  const lines = new Map(layout.relations.map((r) => [r.index, lineOfLayout(r)]));
  const byIndex = new Map(layout.relations.map((r) => [r.index, `${r.from} -> ${r.to}`]));
  return (r, box) => {
    const out: string[] = [];
    for (const o of layout.relations)
      if (o !== r && o.labelBox && !o.crowded && overlap(box, o.labelBox))
        out.push(`its label covers the label of relation ${byIndex.get(o.index)}`);
    // The box less the tolerance: a line along its edge does not run through it.
    const inner = {
      x0: box.x + EPS,
      y0: box.y + EPS,
      x1: box.x + box.width - EPS,
      y1: box.y + box.height - EPS,
    };
    for (const [k, o] of lines.entries())
      if (k !== r.index && crosses(o, inner))
        out.push(`its label is over the line of relation ${byIndex.get(k)}`);
    return out;
  };
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
 * c4-beta's legend: inside the bounds, holding its heading and every swatch and label, and
 * clear of everything else drawn: elements, boundaries, relation lines and labels, the title.
 */
export function legendViolations(layout: C4Layout): string[] {
  const { legend } = layout;
  if (!legend) return [];
  const out: string[] = [];
  if (!inside(layout.bounds, legend.box)) out.push('the legend is outside the bounds');
  const parts = [legend.title, ...legend.rows.flatMap((r) => [r.swatch, r.label])];
  if (parts.some((part) => !inside(legend.box, part)))
    out.push('the legend holds less than it draws');
  const { x, y, width, height } = legend.box;
  const area = { x0: x, y0: y, x1: x + width, y1: y + height };
  const others: [string, Rect][] = [
    ...layout.elements.map((e): [string, Rect] => [`element ${e.alias}`, e.box]),
    ...layout.boundaries.map((b): [string, Rect] => [`boundary ${b.alias}`, b.box]),
    ...layout.relations.flatMap((r): [string, Rect][] =>
      r.labelBox ? [[`the label of ${r.from} -> ${r.to}`, r.labelBox]] : []
    ),
    ...(layout.title ? [['the title', layout.title] as [string, Rect]] : []),
  ];
  for (const [name, box] of others)
    if (overlap(legend.box, box)) out.push(`the legend overlaps ${name}`);
  for (const r of layout.relations)
    if (crosses(lineOfLayout(r), area)) out.push(`the legend covers relation ${r.from} -> ${r.to}`);
  return out;
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
