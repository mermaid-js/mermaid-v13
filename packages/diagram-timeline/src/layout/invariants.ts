/**
 * Layout invariants for `TimelineLayout` (spec #291 T3), for both directions: properties of the
 * output that the layout code does not hold by construction. Run them on any model, hand-built
 * or parser-produced (T2): `timelineLayoutViolations(model, layoutTimeline(model, ctx))`.
 *
 * - no NaN or infinite number;
 * - one section, period and event layout per model entry, with its AST id;
 * - no two boxes (sections, periods, events, the title) overlap, and section bands do not;
 *   neither the axis nor a connector crosses the title;
 * - colour slots follow D251 and `disableMulticolor`;
 * - each label fits its box;
 * - events in their period's column (LR: same x span, below the axis) or row (TD: right of the
 *   axis, between the period's top and the next period's);
 * - connectors join period and event (LR: from the period's bottom, within its span, into its
 *   first event; TD: from the axis to the event's left edge, within its height);
 * - the axis spans every period (LR: across all of them, below them; TD: from above the first
 *   to below the last box, between periods and events);
 * - sections contain their periods (LR: across; TD: below the box, inside its band) and each
 *   band holds its section's box, periods and events;
 * - the bounds hold every box, line and arrowhead.
 *
 * Each violation is one readable line. Comparisons allow a float tolerance.
 */
import type { TimelineModel } from '../model.ts';
import type {
  Point,
  Rect,
  TimelineBox,
  TimelineLayout,
  TimelineLine,
  TimelinePeriodLayout,
} from './types.ts';
import { nonFinite as numbers, within } from '@mermaid-js/core/layout';

const EPS = 1e-6;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS;
const right = (r: Rect): number => r.x + r.width;
const bottom = (r: Rect): number => r.y + r.height;
const insideX = (outer: Rect, inner: Rect): boolean =>
  within(inner.x, outer.x, right(outer)) && within(right(inner), outer.x, right(outer));
const contains = (outer: Rect, inner: Rect): boolean =>
  insideX(outer, inner) &&
  within(inner.y, outer.y, bottom(outer)) &&
  within(bottom(inner), outer.y, bottom(outer));
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < right(b) - EPS && b.x < right(a) - EPS && a.y < bottom(b) - EPS && b.y < bottom(a) - EPS;
const holds = (r: Rect, p: Point): boolean =>
  within(p.x, r.x, right(r)) && within(p.y, r.y, bottom(r));
const fmt = (r: Rect): string => `(${r.x}, ${r.y}, ${r.width} × ${r.height})`;

function counts(model: TimelineModel, layout: TimelineLayout, out: string[]): void {
  if (layout.direction !== model.direction)
    out.push(`direction is ${layout.direction}, the model's is ${model.direction}`);
  if (layout.sections.length !== model.sections.length)
    out.push(`${layout.sections.length} sections laid out, the model has ${model.sections.length}`);
  layout.sections.forEach((s, i) => {
    if (s.section !== i || s.ast !== model.sections[i]?.ast)
      out.push(`section ${i} is ${s.ast}, the model's is ${model.sections[i]?.ast}`);
  });
  if (layout.periods.length !== model.periods.length)
    out.push(`${layout.periods.length} periods laid out, the model has ${model.periods.length}`);
  layout.periods.forEach((p, i) => {
    const mp = model.periods[i];
    if (!mp) return;
    if (p.period !== i || p.ast !== mp.ast)
      out.push(`period ${i} is ${p.ast}, the model's is ${mp.ast}`);
    if (p.section !== mp.section)
      out.push(`period ${p.ast} is in section ${p.section}, not ${mp.section}`);
    const ids = p.events.map((e) => e.ast).join(',');
    const want = mp.events.map((e) => e.ast).join(',');
    if (ids !== want) out.push(`period ${p.ast} has events [${ids}], the model has [${want}]`);
  });
}

/**
 * Every pair of boxes: O(B²) in the boxes, which is fine for a test helper (corpus diagrams
 * hold tens of boxes); the layout itself never runs it.
 */
function noOverlaps(layout: TimelineLayout, out: string[]): void {
  const boxes: { what: string; r: Rect }[] = [
    ...layout.sections.map((s) => ({ what: `section ${s.ast}`, r: s as Rect })),
    ...layout.periods.flatMap((p) => [
      { what: `period ${p.ast}`, r: p as Rect },
      ...p.events.map((e) => ({ what: `event ${e.ast}`, r: e as Rect })),
    ]),
  ];
  if (layout.title) boxes.push({ what: 'the title', r: layout.title });
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (overlaps(boxes[i]!.r, boxes[j]!.r))
        out.push(
          `${boxes[i]!.what} ${fmt(boxes[i]!.r)} overlaps ${boxes[j]!.what} ${fmt(boxes[j]!.r)}`
        );
  const secs = layout.sections;
  for (let i = 0; i < secs.length; i++)
    for (let j = i + 1; j < secs.length; j++)
      if (overlaps(secs[i]!.band, secs[j]!.band))
        out.push(`the band of section ${secs[i]!.ast} overlaps the band of ${secs[j]!.ast}`);
}

/** Each section's periods, built once: the checks below run per section, not per pair. */
type BySection = ReadonlyMap<number, readonly TimelinePeriodLayout[]>;

function bySection(layout: TimelineLayout): BySection {
  const out = new Map<number, TimelinePeriodLayout[]>();
  for (const p of layout.periods) {
    if (p.section === undefined) continue;
    const list = out.get(p.section) ?? [];
    list.push(p);
    out.set(p.section, list);
  }
  return out;
}

function lr(layout: TimelineLayout, own: BySection, out: string[]): void {
  const { axis } = layout;
  for (const p of layout.periods) {
    if (!(axis.y1 > bottom(p) - EPS)) out.push(`the axis is not below period ${p.ast}`);
    if (!within(p.x, axis.x1, axis.x2) || !within(right(p), axis.x1, axis.x2))
      out.push(`the axis (${axis.x1}…${axis.x2}) does not span period ${p.ast}`);
    for (const e of p.events) {
      if (!near(e.x, p.x) || !near(e.width, p.width))
        out.push(`event ${e.ast} is out of the column of period ${p.ast}`);
      if (e.y < axis.y1 - EPS) out.push(`event ${e.ast} starts above the axis`);
    }
  }
  for (const c of layout.connectors) {
    const p = layout.periods[c.period];
    if (!p) {
      out.push(`a connector names period ${c.period}, which is not laid out`);
      continue;
    }
    if (!near(c.x1, c.x2) || !within(c.x1, p.x, right(p)))
      out.push(`the connector of period ${p.ast} is not inside its column`);
    if (!near(c.y1, bottom(p)))
      out.push(`the connector of period ${p.ast} does not start at its bottom`);
    const first = p.events[0];
    if (first && c.y2 < first.y - EPS)
      out.push(`the connector of period ${p.ast} stops above its first event`);
  }
  if (layout.connectors.length !== layout.periods.length)
    out.push(`${layout.connectors.length} connectors for ${layout.periods.length} periods`);
  for (const s of layout.sections)
    for (const p of own.get(s.section) ?? []) {
      if (!insideX(s, p)) out.push(`section ${s.ast} does not span period ${p.ast}`);
      if (bottom(s) > p.y + EPS) out.push(`section ${s.ast} reaches down to period ${p.ast}`);
    }
}

function td(layout: TimelineLayout, own: BySection, out: string[]): void {
  const { axis } = layout;
  const ax = axis.x1;
  const order = [...layout.periods].sort((a, b) => a.y - b.y);
  order.forEach((p, k) => {
    const next = order[k + 1];
    if (right(p) > ax + EPS) out.push(`period ${p.ast} reaches over the axis`);
    if (!(axis.y1 <= p.y + EPS) || !(axis.y2 >= bottom(p) - EPS))
      out.push(`the axis (${axis.y1}…${axis.y2}) does not span period ${p.ast}`);
    for (const e of p.events) {
      if (e.x < ax - EPS) out.push(`event ${e.ast} is left of the axis`);
      if (e.y < p.y - EPS || (next && bottom(e) > next.y + EPS))
        out.push(`event ${e.ast} is out of the row of period ${p.ast}`);
      if (axis.y2 < bottom(e) - EPS) out.push(`the axis ends above event ${e.ast}`);
    }
  });
  let n = 0;
  layout.periods.forEach((p) => (n += p.events.length));
  if (layout.connectors.length !== n)
    out.push(`${layout.connectors.length} connectors for ${n} events`);
  for (const c of layout.connectors) {
    const e = c.event === undefined ? undefined : layout.periods[c.period]?.events[c.event];
    if (!e) {
      out.push(`a connector names event ${c.period}.${c.event}, which is not laid out`);
      continue;
    }
    if (!near(c.x1, ax) || !near(c.x2, e.x))
      out.push(`the connector of event ${e.ast} does not run from the axis to it`);
    if (!near(c.y1, c.y2) || !within(c.y1, e.y, bottom(e)))
      out.push(`the connector of event ${e.ast} is not level with it`);
  }
  for (const s of layout.sections)
    for (const p of own.get(s.section) ?? []) {
      if (!insideX(s, p)) out.push(`section ${s.ast} does not span period ${p.ast}`);
      if (bottom(s) > p.y + EPS) out.push(`section ${s.ast} reaches down to period ${p.ast}`);
      for (const e of p.events)
        if (!insideX(s, e)) out.push(`section ${s.ast} does not span event ${e.ast}`);
    }
}

function bands(layout: TimelineLayout, own: BySection, out: string[]): void {
  for (const s of layout.sections) {
    if (!contains(s.band, s)) out.push(`the band of section ${s.ast} does not hold its box`);
    for (const p of own.get(s.section) ?? []) {
      for (const r of [p as TimelineBox, ...p.events])
        if (!contains(s.band, r)) out.push(`the band of section ${s.ast} does not hold ${r.ast}`);
    }
  }
}

/**
 * Whether the segment passes through the inside of `r` (touching an edge does not count):
 * Liang–Barsky clipping against `r` shrunk by the tolerance.
 */
function crosses(l: TimelineLine, r: Rect): boolean {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  let lo = 0;
  let hi = 1;
  const sides: [number, number][] = [
    [-dx, l.x1 - (r.x + EPS)],
    [dx, right(r) - EPS - l.x1],
    [-dy, l.y1 - (r.y + EPS)],
    [dy, bottom(r) - EPS - l.y1],
  ];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
    if (lo > hi) return false;
  }
  return true;
}

function clearOfTitle(layout: TimelineLayout, out: string[]): void {
  const t = layout.title;
  if (!t) return;
  if (crosses(layout.axis, t)) out.push('the axis crosses the title');
  layout.connectors.forEach((c, i) => {
    if (crosses(c, t)) out.push(`connector ${i} crosses the title`);
  });
}

/** What `timelineLayoutViolations` needs to know of the config the layout ran with. */
export interface ViolationOptions {
  /** `timeline.disableMulticolor`. */
  readonly disableMulticolor?: boolean;
}

/**
 * Colour slots: a section its ordinal; a period its section's, 0 before the first (D251), or
 * with no sections its own index (0 under `disableMulticolor`); events and connectors their
 * period's.
 */
function slots(
  model: TimelineModel,
  layout: TimelineLayout,
  options: ViolationOptions,
  out: string[]
): void {
  for (const s of layout.sections)
    if (s.slot !== s.section) out.push(`section ${s.ast} is in slot ${s.slot}, not ${s.section}`);
  const sectioned = model.sections.length > 0;
  const flat = options.disableMulticolor === true;
  const wanted = (p: TimelinePeriodLayout, i: number): number => {
    if (sectioned) return p.section ?? 0;
    return flat ? 0 : i;
  };
  layout.periods.forEach((p, i) => {
    const want = wanted(p, i);
    if (p.slot !== want) out.push(`period ${p.ast} is in slot ${p.slot}, not ${want}`);
    for (const e of p.events)
      if (e.slot !== p.slot) out.push(`event ${e.ast} is in slot ${e.slot}, not its period's`);
  });
  for (const c of layout.connectors) {
    const p = layout.periods[c.period];
    if (p && c.slot !== p.slot) out.push(`a connector of period ${p.ast} is not in its slot`);
  }
}

/** Each label fits its box: no wider than the box less its padding, no taller than the box. */
function labelsFit(layout: TimelineLayout, out: string[]): void {
  const boxes: TimelineBox[] = [
    ...layout.sections,
    ...layout.periods.flatMap((p) => [p as TimelineBox, ...p.events]),
  ];
  for (const b of boxes) {
    if (b.label.width > b.width - 2 * b.padding + EPS)
      out.push(`the label of ${b.ast} is wider than its box`);
    if (b.label.height > b.height + EPS) out.push(`the label of ${b.ast} is taller than its box`);
  }
}

function lineRects(l: TimelineLine): Point[] {
  return [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, l.arrow.tip, l.arrow.left, l.arrow.right];
}

function inBounds(layout: TimelineLayout, out: string[]): void {
  const b = layout.bounds;
  const rects: { what: string; r: Rect }[] = [
    ...layout.sections.map((s) => ({ what: s.ast, r: s as Rect })),
    ...layout.periods.flatMap((p: TimelinePeriodLayout) => [
      { what: p.ast, r: p as Rect },
      ...p.events.map((e) => ({ what: e.ast, r: e as Rect })),
    ]),
  ];
  if (layout.title) rects.push({ what: 'the title', r: layout.title });
  for (const { what, r } of rects) if (!contains(b, r)) out.push(`the bounds do not hold ${what}`);
  const lines = [
    ...layout.connectors.map((c, i) => ({ what: `connector ${i}`, l: c as TimelineLine })),
    { what: 'the axis', l: layout.axis },
  ];
  for (const { what, l } of lines)
    if (!lineRects(l).every((p) => holds(b, p))) out.push(`the bounds do not hold ${what}`);
}

/**
 * Every invariant `layout` breaks for `model`, one line each; empty when it holds. Pass the
 * `disableMulticolor` the layout ran with, for the colour slot check.
 */
export function timelineLayoutViolations(
  model: TimelineModel,
  layout: TimelineLayout,
  options: ViolationOptions = {}
): string[] {
  const out: string[] = [];
  numbers(layout, 'layout', out);
  counts(model, layout, out);
  noOverlaps(layout, out);
  clearOfTitle(layout, out);
  const own = bySection(layout);
  if (layout.direction === 'TD') td(layout, own, out);
  else lr(layout, own, out);
  bands(layout, own, out);
  slots(model, layout, options, out);
  labelsFit(layout, out);
  inBounds(layout, out);
  return out;
}
