// cspell:words nonterminals
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
 * - a choice branch v12 put on the main line stays on it, straight, and a choice is no taller
 *   than v12's stack plus what D514's `2r` guard adds on each side;
 * - the track never runs through a box, nor along its edge (with `arcRadius` 0 v12's corners
 *   touch the boxes, so then only through);
 * - boxes (terminals, nonterminals, specials) never overlap within a rule;
 * - each rule has a marker at both ends, joined to the definition's track by its lead-in and
 *   lead-out, clear of the name and the definition (a marker wider than v12's gap covers part of
 *   them, as in v12: only the gap is checked);
 * - rules never overlap and come in order (markers aside: v12's rule height ignores
 *   `markerRadius`, so a large marker reaches into the next rule);
 * - the bounding box is the canvas grown over everything drawn (D224), worked out here from the
 *   primitives, half the stroke included;
 * - with a measurer: every text measures what it says, the rule name at the bold weight (D514),
 *   and each box is its text plus `padding` on every side.
 */
import type { Measurer } from '@mermaid-js/core/text';
import type { RailroadLayoutConfig } from '../config.ts';
import type { RailroadModel, RailroadNode } from '../model.ts';
import { BOLD_WEIGHT, RAILROAD_METRICS as m } from './metrics.ts';
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
const pathPoints = (path: TrackPath): Point[] => [path.start, ...path.segments];
const pt = (p: Point): string => `(${p.x}, ${p.y})`;
const box0 = (e: RailroadExpressionLayout): Rect => ({
  x: e.x,
  y: e.y,
  width: e.width,
  height: e.up + e.down,
});

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

/**
 * A choice against v12's stack (`railroadRenderer.ts:222-313`), worked out here from the
 * branches' sizes: a branch v12 put on the main line (within float noise) is on it and straight,
 * and the choice is no taller than v12's stack plus D514's guard on each side.
 */
function choiceViolations(e: RailroadExpressionLayout, o: RailroadLayoutConfig, out: string[]) {
  const { verticalSeparation: vs, arcRadius: r } = o;
  const tracks: number[] = [];
  let total = 0;
  for (const c of e.children) {
    tracks.push(total + c.up);
    total += c.up + c.down + vs;
  }
  total -= e.children.length > 0 ? vs : 0;
  const centre = total / 2;
  let above = Infinity;
  let below = Infinity;
  tracks.forEach((t, i) => {
    const d = t - centre;
    const c = e.children[i]!;
    if (Math.abs(d) <= EPS) {
      const straight = (p: TrackPath) => p.segments.length === 1 && p.segments[0]!.kind === 'line';
      const on = near(c.y + c.up, e.up);
      const left = e.paths.find((p) => same(p.start, 0, e.up) && same(last(p), c.x, c.y + c.up));
      const right = e.paths.find(
        (p) => same(p.start, c.x + c.width, c.y + c.up) && same(last(p), e.width, e.up)
      );
      if (!on || !left || !right || !straight(left) || !straight(right)) {
        out.push(`${e.ast}: branch ${i}, on v12's main line, is not drawn straight on it`);
      }
    } else if (d < 0) above = Math.min(above, -d);
    else below = Math.min(below, d);
  });
  const guard = (d: number) => (d < 2 * r ? 2 * r - d : 0);
  const most = total + guard(above) + guard(below);
  if (e.up + e.down > most + EPS) {
    out.push(`${e.ast}: ${e.up + e.down} high, D514 needs at most ${most}`);
  }
}

/** The checks on one expression, in its own coordinates. */
function expressionViolations(
  e: RailroadExpressionLayout,
  node: RailroadNode,
  o: RailroadLayoutConfig,
  out: string[]
): void {
  const at = e.ast;
  const r = o.arcRadius;
  if (e.kind !== node.type || e.ast !== node.astId) {
    out.push(`${at}: is ${e.kind} ${e.ast}, the model has ${node.type} ${node.astId}`);
    return;
  }
  if (e.width < -EPS || e.up < -EPS || e.down < -EPS) out.push(`${at}: negative size`);
  const own: Rect = { x: 0, y: 0, width: e.width, height: e.up + e.down };
  const kids = childrenOf(node);
  if (e.children.length !== kids.length) {
    out.push(`${at}: ${e.children.length} children, the model has ${kids.length}`);
    return;
  }
  for (const c of e.children) {
    if (!inside(box0(c), own)) out.push(`${at}: child ${c.ast} is outside its box`);
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
  if (node.type === 'choice') choiceViolations(e, o, out);
  e.children.forEach((c, i) => expressionViolations(c, kids[i]!, o, out));
}

/** The checks on one rule's markers and lead lines, in its coordinates. */
function ruleViolations(rule: RailroadRuleLayout, out: string[]): void {
  const { start, end, leadIn, leadOut, definition: d, baseline } = rule;
  const at = rule.ast;
  if (rule.label.text !== `${rule.name} =`) out.push(`${at}: the label is not \`name =\``);
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
  // v12's gaps: a marker wider than its gap covers that much of the name or the definition.
  if (start.cx + Math.min(start.r, m.definitionGap) > d.x + EPS) {
    out.push(`${at}: the start marker runs into the definition`);
  }
  if (end.cx - Math.min(end.r, m.endGap) < d.x + d.width - EPS) {
    out.push(`${at}: the end marker runs into the definition`);
  }
  const name = rule.label.box;
  if (name.x + name.width > start.cx - Math.min(start.r, m.nameGap) + EPS) {
    out.push(`${at}: the name runs into the start marker`);
  }
}

/** One drawn primitive of a rule, in diagram coordinates. */
interface Part {
  readonly what: string;
  readonly rect: Rect;
  readonly stroked: boolean;
}

/** An axis-aligned line of track, in diagram coordinates. */
interface Line {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/**
 * A rule's primitives, walked here (not through the layout's own helpers): the name, the
 * markers, every track point, box and text; its leaf boxes; and its straight track pieces
 * inside the definition.
 */
function primitives(rule: RailroadRuleLayout) {
  const parts: Part[] = [];
  const boxes: { ast: string; rect: Rect }[] = [];
  const lines: Line[] = [];
  const { x: ox, y: oy } = rule.origin;
  const move = (r: Rect, dx: number, dy: number): Rect => ({ ...r, x: r.x + dx, y: r.y + dy });
  const track = (p: TrackPath, dx: number, dy: number, keep: boolean) => {
    let from = p.start;
    for (const q of [p.start, ...p.segments]) {
      parts.push({
        what: 'track',
        rect: { x: q.x + dx, y: q.y + dy, width: 0, height: 0 },
        stroked: true,
      });
    }
    for (const s of p.segments) {
      if (keep && s.kind === 'line') {
        lines.push({ x0: from.x + dx, y0: from.y + dy, x1: s.x + dx, y1: s.y + dy });
      }
      from = s;
    }
  };
  parts.push({ what: 'name', rect: move(rule.label.box, ox, oy), stroked: false });
  for (const k of [rule.start, rule.end]) {
    const rect = { x: k.cx - k.r + ox, y: k.cy - k.r + oy, width: 2 * k.r, height: 2 * k.r };
    parts.push({ what: 'marker', rect, stroked: false });
  }
  // v12's lead lines run back under a marker wider than its gap: they are not checked for
  // clearance.
  track(rule.leadIn, ox, oy, false);
  track(rule.leadOut, ox, oy, false);
  const walk = (e: RailroadExpressionLayout, dx: number, dy: number) => {
    for (const p of e.paths) track(p, dx, dy, true);
    if (e.box) {
      const rect = move(e.box, dx, dy);
      parts.push({ what: 'box', rect, stroked: true });
      boxes.push({ ast: e.ast, rect });
    }
    if (e.text) parts.push({ what: 'text', rect: move(e.text.box, dx, dy), stroked: false });
    for (const c of e.children) walk(c, dx + c.x, dy + c.y);
  };
  walk(rule.definition, ox + rule.definition.x, oy + rule.definition.y);
  return { parts, boxes, lines };
}

/**
 * Where a straight track piece meets a box: through its inside, or (`edges`) along an edge for
 * more than a point.
 */
function meets(l: Line, b: Rect, edges: boolean): 'through' | 'along' | undefined {
  const x0 = Math.min(l.x0, l.x1);
  const x1 = Math.max(l.x0, l.x1);
  const y0 = Math.min(l.y0, l.y1);
  const y1 = Math.max(l.y0, l.y1);
  const span = (a0: number, a1: number, lo: number, hi: number) =>
    Math.min(a1, hi) - Math.max(a0, lo);
  const sx = span(x0, x1, b.x, b.x + b.width);
  const sy = span(y0, y1, b.y, b.y + b.height);
  const horizontal = y1 - y0 <= EPS;
  const runs = horizontal ? sx : sy;
  const across = horizontal ? y0 : x0;
  const [lo, hi] = horizontal ? [b.y, b.y + b.height] : [b.x, b.x + b.width];
  if (runs <= EPS) return undefined;
  if (across > lo + EPS && across < hi - EPS) return 'through';
  if (edges && across >= lo - EPS && across <= hi + EPS && (horizontal ? sx : sy) > EPS) {
    return 'along';
  }
  return undefined;
}

/** Text and box sizes against an independent measurement (`measurer`). */
function measuredViolations(
  rule: RailroadRuleLayout,
  layout: RailroadLayout,
  measurer: Measurer,
  out: string[]
): void {
  const { text } = layout.fonts;
  const bold = { ...text, weight: BOLD_WEIGHT };
  const nameWidth = measurer.width(`${rule.name} =`, bold, 0);
  if (!near(rule.label.box.width, nameWidth)) {
    out.push(
      `${rule.ast}: the name is ${rule.label.box.width} wide, bold it measures ${nameWidth}`
    );
  }
  const p = layout.options.padding;
  const lineHeight = measurer.metrics(text).lineHeight;
  const walk = (e: RailroadExpressionLayout) => {
    if (e.text && e.box) {
      const w = measurer.width(e.text.text, text, 0);
      if (!near(e.text.box.width, w) || !near(e.box.width, w + 2 * p)) {
        out.push(`${e.ast}: its text measures ${w}, the box is ${e.box.width} wide`);
      }
      if (!near(e.box.height, lineHeight + 2 * p))
        out.push(`${e.ast}: the box is not one line high`);
    }
    e.children.forEach(walk);
  };
  walk(rule.definition);
}

/**
 * Every way `layout` breaks the railroad layout's invariants for `model`; none when it holds.
 * With `measurer` (the one the layout used), the texts' sizes are checked against it too.
 */
export function railroadLayoutViolations(
  model: RailroadModel,
  layout: RailroadLayout,
  measurer?: Measurer
): string[] {
  const out: string[] = [];
  nonFinite(layout, 'layout', out);
  if (out.length > 0) return out;
  if (layout.rules.length !== model.rules.length) {
    return [`${layout.rules.length} rules, the model has ${model.rules.length}`];
  }
  const o = layout.options;
  const r = o.arcRadius;
  const half = o.strokeWidth / 2;
  const bounds = { x0: 0, y0: 0, x1: layout.width, y1: layout.height };

  const extents: Rect[] = [];
  layout.rules.forEach((rule, i) => {
    const mr = model.rules[i]!;
    if (rule.ast !== mr.astId || rule.name !== mr.name) {
      out.push(`rule ${i} is ${rule.ast}, the model has ${mr.astId}`);
      return;
    }
    expressionViolations(rule.definition, mr.definition, o, out);
    ruleViolations(rule, out);
    if (measurer) measuredViolations(rule, layout, measurer, out);
    // v12 ends the lead-out at the end marker's left edge, behind its start under a marker
    // wider than the gap: only the pieces are checked.
    for (const p of [rule.leadIn, rule.leadOut]) {
      for (const b of badSegments(p, r, false)) out.push(`${rule.ast}: ${b}`);
    }

    const { parts, boxes, lines } = primitives(rule);
    const extent = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const part of parts) {
      const g = part.stroked ? half : 0;
      const q = part.rect;
      // v12's rule height ignores `markerRadius`: a marker taller than the gap between rules
      // reaches into its neighbour, as in v12, so markers stay out of the rule's extent.
      if (part.what !== 'marker') {
        extent.x0 = Math.min(extent.x0, q.x);
        extent.y0 = Math.min(extent.y0, q.y);
        extent.x1 = Math.max(extent.x1, q.x + q.width);
        extent.y1 = Math.max(extent.y1, q.y + q.height);
      }
      bounds.x0 = Math.min(bounds.x0, q.x - g);
      bounds.y0 = Math.min(bounds.y0, q.y - g);
      bounds.x1 = Math.max(bounds.x1, q.x + q.width + g);
      bounds.y1 = Math.max(bounds.y1, q.y + q.height + g);
    }
    extents.push({
      x: extent.x0,
      y: extent.y0,
      width: extent.x1 - extent.x0,
      height: extent.y1 - extent.y0,
    });
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        if (overlap(boxes[a]!.rect, boxes[b]!.rect)) {
          out.push(`${boxes[a]!.ast} and ${boxes[b]!.ast} overlap`);
        }
      }
    }
    for (const l of lines) {
      for (const b of boxes) {
        const how = meets(l, b.rect, r > EPS);
        if (how) out.push(`${rule.ast}: the track runs ${how} ${b.ast}`);
      }
    }
  });

  const want = {
    x: bounds.x0,
    y: bounds.y0,
    width: bounds.x1 - bounds.x0,
    height: bounds.y1 - bounds.y0,
  };
  const got = layout.bounds;
  if (
    !near(got.x, want.x) ||
    !near(got.y, want.y) ||
    !near(got.width, want.width) ||
    !near(got.height, want.height)
  ) {
    out.push(`the bounds are ${JSON.stringify(got)}, what is drawn covers ${JSON.stringify(want)}`);
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
