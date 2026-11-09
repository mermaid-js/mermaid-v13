/**
 * The railroad layout's invariants (spec #526 §Testing, R-LAYOUT-3): what every `RailroadLayout`
 * of a model must satisfy, as messages (none when it holds).
 *
 * - no NaN or infinite number anywhere;
 * - the rules are the model's, in order, and so is each expression tree (kind and AST id);
 * - every child lies inside its parent's box, and every track point inside its own expression's
 *   box (the arcs stay inside it);
 * - track pieces are straight lines across or down, or quarter-circle corners of `arcRadius`,
 *   and the track turns smoothly and runs left to right: no piece doubles back (v12's
 *   overshooting choice arcs, D514);
 * - each path of a sequence, optional or repetition joins the element's track; every branch of a
 *   choice joins the choice's main line at both ends;
 * - boxes (terminals, nonterminals, specials) never overlap, within a rule or across rules;
 * - each rule has a marker at both ends, joined to the definition's track by its lead-in and
 *   lead-out;
 * - rules never overlap and come in order;
 * - everything drawn lies inside the bounding box (D224).
 */
import type { RailroadModel, RailroadNode } from '../model.ts';
import { Box, pathPoints, visitExpressions, visitRule } from './geometry.ts';
import type {
  Point,
  RailroadExpressionLayout,
  RailroadLayout,
  RailroadRuleLayout,
  Rect,
  TrackPath,
} from './types.ts';

const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
const same = (p: Point, x: number, y: number): boolean => near(p.x, x) && near(p.y, y);
const last = (path: TrackPath): Point => path.segments[path.segments.length - 1] ?? path.start;
const pt = (p: Point): string => `(${p.x}, ${p.y})`;

/** Whether two rectangles share more than an edge. */
const overlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - EPS &&
  b.x < a.x + a.width - EPS &&
  a.y < b.y + b.height - EPS &&
  b.y < a.y + a.height - EPS;

const inside = (r: Rect, outer: Rect): boolean =>
  r.x >= outer.x - EPS &&
  r.y >= outer.y - EPS &&
  r.x + r.width <= outer.x + outer.width + EPS &&
  r.y + r.height <= outer.y + outer.height + EPS;

/** Every non-finite number in `value`, by path. */
function nonFinite(value: unknown, at: string, out: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) out.push(`${at} is ${value}`);
  } else if (Array.isArray(value)) value.forEach((v, i) => nonFinite(v, `${at}[${i}]`, out));
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) nonFinite(v, `${at}.${k}`, out);
  }
}

const childrenOf = (n: RailroadNode): readonly RailroadNode[] => {
  switch (n.type) {
    case 'sequence':
      return n.elements;
    case 'choice':
      return n.alternatives;
    case 'optional':
    case 'repetition':
      return [n.element];
    case 'terminal':
    case 'nonterminal':
    case 'special':
      return [];
  }
};

/** A unit direction along an axis. */
type Heading = readonly [number, number];

/**
 * A quarter circle's heading where it starts and where it ends. Its start is across (x) or down
 * (y), and SVG's sweep flag says which: turning from across to down is clockwise when the two
 * signs agree (y grows downwards).
 */
function arcHeadings(dx: number, dy: number, sweep: boolean): [Heading, Heading] {
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const across = sweep === sx * sy > 0;
  return across
    ? [
        [sx, 0],
        [0, sy],
      ]
    : [
        [0, sy],
        [sx, 0],
      ];
}

/**
 * The track pieces of `path` that are neither straight across or down nor a quarter circle of
 * `r`, and every place the track does not turn smoothly: a piece that starts in another
 * direction than the one before it ended (v12's overshooting arcs, D514). With `forward`, the
 * path must also start and end running left to right. Both need corners: with `arcRadius` 0
 * every corner is a sharp turn.
 */
function badSegments(path: TrackPath, r: number, forward: boolean): string[] {
  const out: string[] = [];
  let from = path.start;
  let first: Heading | undefined;
  let heading: Heading | undefined;
  for (const s of path.segments) {
    const dx = s.x - from.x;
    const dy = s.y - from.y;
    let start: Heading | undefined;
    let end: Heading | undefined;
    if (s.kind === 'line') {
      if (Math.abs(dx) > EPS && Math.abs(dy) > EPS) out.push(`diagonal line to ${pt(s)}`);
      else if (Math.abs(dx) > EPS || Math.abs(dy) > EPS) {
        start = end = [
          Math.abs(dx) > EPS ? Math.sign(dx) : 0,
          Math.abs(dy) > EPS ? Math.sign(dy) : 0,
        ];
      }
    } else if (!near(s.radius, r) || !near(Math.abs(dx), r) || !near(Math.abs(dy), r)) {
      out.push(`arc to ${pt(s)} is not a quarter circle of ${r}`);
    } else if (r > EPS) {
      [start, end] = arcHeadings(dx, dy, s.sweep);
    }
    // With `arcRadius` 0 every corner is a sharp turn, as v12 drew it.
    const smooth = r > EPS;
    if (smooth && start && heading && (start[0] !== heading[0] || start[1] !== heading[1])) {
      out.push(`the track turns sharply or doubles back at ${pt(from)}`);
    }
    first ??= start;
    heading = end ?? heading;
    from = s;
  }
  const rightwards = (h: Heading | undefined) => !h || (h[0] === 1 && h[1] === 0);
  if (forward && r > EPS && (!rightwards(first) || !rightwards(heading))) {
    out.push(`the track from ${pt(path.start)} does not run left to right`);
  }
  return out;
}

/** How an expression's paths join its children's tracks, by kind. */
function trackViolations(e: RailroadExpressionLayout, node: RailroadNode, out: string[]): void {
  const at = e.ast;
  const entry = (c: RailroadExpressionLayout): Point => ({ x: c.x, y: c.y + c.up });
  const exit = (c: RailroadExpressionLayout): Point => ({ x: c.x + c.width, y: c.y + c.up });
  const joins = (from: Point, to: Point): boolean =>
    e.paths.some((p) => same(p.start, from.x, from.y) && same(last(p), to.x, to.y));
  switch (node.type) {
    case 'sequence':
      e.children.forEach((c, i) => {
        if (!near(c.y + c.up, e.up)) out.push(`${at}: element ${i} is off the track`);
        const next = e.children[i + 1];
        if (next && !joins(exit(c), entry(next))) {
          out.push(`${at}: elements ${i} and ${i + 1} are not joined`);
        }
      });
      break;
    case 'choice':
      e.children.forEach((c, i) => {
        if (!joins({ x: 0, y: e.up }, entry(c))) {
          out.push(`${at}: branch ${i} does not leave the main line`);
        }
        if (!joins(exit(c), { x: e.width, y: e.up })) {
          out.push(`${at}: branch ${i} does not rejoin the main line`);
        }
      });
      break;
    case 'optional':
    case 'repetition': {
      const c = e.children[0]!;
      if (!near(c.y + c.up, e.up)) out.push(`${at}: the element is off the track`);
      if (!joins({ x: 0, y: e.up }, entry(c)) || !joins(exit(c), { x: e.width, y: e.up })) {
        out.push(`${at}: the element is not on the track`);
      }
      const around = node.type === 'optional' || node.min === 0;
      if (around && !joins({ x: 0, y: e.up }, { x: e.width, y: e.up })) {
        out.push(`${at}: no bypass`);
      }
      if (node.type === 'repetition' && !joins(exit(c), entry(c))) out.push(`${at}: no loop`);
      break;
    }
    case 'terminal':
    case 'nonterminal':
    case 'special':
      if (!e.box || !e.text) out.push(`${at}: no box or text`);
  }
}

/** The checks on one expression, in its own coordinates. */
function expressionViolations(
  e: RailroadExpressionLayout,
  node: RailroadNode,
  r: number,
  out: string[]
): void {
  const at = e.ast;
  if (e.kind !== node.type || e.ast !== node.astId) {
    out.push(`${at}: is ${e.kind} ${e.ast}, the model has ${node.type} ${node.astId}`);
    return;
  }
  const h = e.up + e.down;
  if (e.width < -EPS || e.up < -EPS || e.down < -EPS) out.push(`${at}: negative size`);
  const own: Rect = { x: 0, y: 0, width: e.width, height: h };
  const kids = childrenOf(node);
  if (e.children.length !== kids.length) {
    out.push(`${at}: ${e.children.length} children, the model has ${kids.length}`);
    return;
  }
  for (const c of e.children) {
    if (!inside({ x: c.x, y: c.y, width: c.width, height: c.up + c.down }, own)) {
      out.push(`${at}: child ${c.ast} is outside its box`);
    }
  }
  for (const p of e.paths) {
    for (const q of pathPoints(p)) {
      if (!inside({ x: q.x, y: q.y, width: 0, height: 0 }, own)) {
        out.push(`${at}: track point ${pt(q)} is outside its box`);
      }
    }
    for (const b of badSegments(p, r, true)) out.push(`${at}: ${b}`);
  }
  if (e.box && !inside(e.box, own)) out.push(`${at}: its rect is outside its box`);

  trackViolations(e, node, out);
  e.children.forEach((c, i) => expressionViolations(c, kids[i]!, r, out));
}

/** The checks on one rule's markers and lead lines. */
function ruleViolations(rule: RailroadRuleLayout, out: string[]): void {
  const { start, end, leadIn, leadOut, definition: d, baseline } = rule;
  const at = rule.ast;
  if (!near(start.cy, baseline) || !near(end.cy, baseline)) {
    out.push(`${at}: a marker is off the track`);
  }
  if (!near(d.y + d.up, baseline)) out.push(`${at}: the definition is off the track`);
  if (!same(leadIn.start, start.cx + start.r, baseline) || !same(last(leadIn), d.x, baseline)) {
    out.push(`${at}: the lead-in does not join the start marker to the definition`);
  }
  if (
    !same(leadOut.start, d.x + d.width, baseline) ||
    !same(last(leadOut), end.cx - end.r, baseline)
  ) {
    out.push(`${at}: the lead-out does not join the definition to the end marker`);
  }
  if (start.cx > d.x + EPS || end.cx < d.x + d.width - EPS) {
    out.push(`${at}: the markers are not at both ends`);
  }
  if (rule.label.box.x + rule.label.box.width > start.cx + EPS) {
    out.push(`${at}: the name runs into the start marker`);
  }
}

/** Every way `layout` breaks the railroad layout's invariants for `model`; none when it holds. */
export function railroadLayoutViolations(model: RailroadModel, layout: RailroadLayout): string[] {
  const out: string[] = [];
  nonFinite(layout, 'layout', out);
  if (out.length > 0) return out;
  if (layout.rules.length !== model.rules.length) {
    return [`${layout.rules.length} rules, the model has ${model.rules.length}`];
  }
  const r = layout.options.arcRadius;
  const half = layout.options.strokeWidth / 2;
  const canvas = { x: 0, y: 0, width: layout.width, height: layout.height };
  if (!inside(canvas, layout.bounds)) out.push('the bounds do not cover the canvas');

  const boxes: { ast: string; rect: Rect }[] = [];
  const extents: Rect[] = [];
  layout.rules.forEach((rule, i) => {
    const m = model.rules[i]!;
    if (rule.ast !== m.astId || rule.name !== m.name) {
      out.push(`rule ${i} is ${rule.ast}, the model has ${m.astId}`);
      return;
    }
    expressionViolations(rule.definition, m.definition, r, out);
    ruleViolations(rule, out);
    // v12 ends the lead-out at the end marker's left edge, behind its start under a marker
    // wider than the gap: only the pieces are checked.
    for (const p of [rule.leadIn, rule.leadOut]) {
      for (const b of badSegments(p, r, false)) out.push(`${rule.ast}: ${b}`);
    }
    const extent = new Box();
    visitRule(rule, (d) => {
      extent.add(d.rect);
      const drawn = d.stroked
        ? {
            x: d.rect.x - half,
            y: d.rect.y - half,
            width: d.rect.width + 2 * half,
            height: d.rect.height + 2 * half,
          }
        : d.rect;
      if (!inside(drawn, layout.bounds)) out.push(`${rule.ast}: a ${d.part} is outside the bounds`);
    });
    visitExpressions(rule, (e, dx, dy) => {
      if (e.box) boxes.push({ ast: e.ast, rect: { ...e.box, x: e.box.x + dx, y: e.box.y + dy } });
    });
    extents.push(extent.rect());
  });

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (overlap(boxes[i]!.rect, boxes[j]!.rect)) {
        out.push(`${boxes[i]!.ast} and ${boxes[j]!.ast} overlap`);
      }
    }
  }
  for (let i = 1; i < extents.length; i++) {
    const prev = layout.rules[i - 1]!;
    const rule = layout.rules[i]!;
    if (rule.origin.y < prev.origin.y + prev.height - EPS) {
      out.push(`${rule.ast} starts inside ${prev.ast}`);
    }
    for (let j = 0; j < i; j++) {
      if (overlap(extents[i]!, extents[j]!)) {
        out.push(`${rule.ast} overlaps ${layout.rules[j]!.ast}`);
      }
    }
  }
  return out;
}
