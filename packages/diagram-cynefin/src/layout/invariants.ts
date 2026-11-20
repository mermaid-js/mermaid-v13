/**
 * The cynefin layout's invariants (spec #423 "Invariants", R-LAYOUT-3): what every
 * `CynefinLayout` must satisfy for the model it was laid out from. Empty when the layout is
 * sound; each entry names a broken rule. No NaN anywhere, at any config value (D366); every
 * drawn item, label, curve and arrowhead inside the bounds (D361); lengths in px.
 */
import type { CynefinDomainName, CynefinModel } from '../model.ts';
import { cubicBox, pointsBox, quadBox } from './geometry.ts';
import { growRect } from '@mermaid-js/core/layout';
import { drawnItems } from './layout.ts';
import { ARROWS, BADGES } from './metrics.ts';
import type { CynefinBadge, CynefinLayout, Point, Rect } from './types.ts';
import {
  EPS,
  nonFinite as finite,
  rectInside,
  rectsOverlap,
} from '@mermaid-js/shared/testing/layout-invariants';

export function cynefinLayoutViolations(model: CynefinModel, layout: CynefinLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  const { width, height, padding, bounds, viewBox } = layout;
  for (const [k, f] of Object.entries(layout.fonts))
    if (!(typeof f.size === 'number' && f.size > 0)) out.push(`the ${k} font is ${f.size} px`);

  // The SVG: the canvas at (padding, padding), the viewBox the bounds there, never smaller
  // than v12's (D361).
  if (layout.offset.x !== padding || layout.offset.y !== padding)
    out.push('the canvas is not offset by the padding');
  if (!same(viewBox, { ...bounds, x: bounds.x + padding, y: bounds.y + padding }))
    out.push('the viewBox is not the bounds offset by the padding');
  const v12 = {
    x: -padding,
    y: -padding,
    width: width + 2 * padding,
    height: height + 2 * padding,
  };
  if (!contains(bounds, v12)) out.push("the bounds are smaller than v12's viewBox");

  // The quadrants tile the canvas in v12's order: two columns of half the width, and two rows
  // that meet at the horizon, where the ellipse sits (a row grows for its list, D617).
  const tiles: readonly [string, number, number][] = [
    ['complex', 0, 0],
    ['complicated', 1, 0],
    ['chaotic', 0, 1],
    ['clear', 1, 1],
  ];
  if (layout.quadrants.length !== tiles.length) out.push(`${layout.quadrants.length} quadrants`);
  const upper = layout.quadrants[0]?.height ?? 0;
  layout.quadrants.forEach((q, i) => {
    const [name, col, row] = tiles[i] ?? ['', 0, 0];
    const want = {
      x: (col * width) / 2,
      y: row * upper,
      width: width / 2,
      height: row === 0 ? upper : height - upper,
    };
    if (q.name !== name) out.push(`quadrant ${i} is ${q.name}, not ${name}`);
    if (!same(q, want)) out.push(`${q.name} is not its part of the canvas`);
    if (Math.abs(q.center.x - (q.x + q.width / 2)) > EPS)
      out.push(`${q.name}'s centre is off its column`);
  });
  if (Math.abs(layout.confusion.center.y - upper) > EPS)
    out.push('the confusion ellipse is off the horizon');
  const declared = new Map(model.domains.map((d) => [d.name, d]));
  for (const q of layout.quadrants)
    if (q.ast !== declared.get(q.name)?.ast) out.push(`${q.name} has AST id ${q.ast}`);
  if (layout.confusion.ast !== declared.get('confusion')?.ast)
    out.push(`confusion has AST id ${layout.confusion.ast}`);

  // Fixed texts: five names; nine subtitles with descriptions, none without.
  if (layout.labels.length !== 5) out.push(`${layout.labels.length} domain labels`);
  const subtitles = layout.showDomainDescriptions ? 9 : 0;
  if (layout.subtitles.length !== subtitles)
    out.push(`${layout.subtitles.length} subtitles, not ${subtitles}`);

  itemViolations(model, layout, out);
  transitionViolations(model, layout, out);

  // Everything drawn inside the bounds.
  const inside = (r: Rect, what: string): void => {
    if (!contains(bounds, r)) out.push(`${what} is outside the bounds`);
  };
  const e = layout.confusion;
  inside(
    growRect(
      { x: e.center.x - e.rx, y: e.center.y - e.ry, width: 2 * e.rx, height: 2 * e.ry },
      e.strokeWidth / 2
    ),
    'the confusion ellipse'
  );
  const { fold, horizon, cliff } = layout.boundaries;
  inside(growRect(cubicBox(fold), layout.strokes.boundary / 2), 'the fold');
  inside(growRect(cubicBox(horizon), layout.strokes.boundary / 2), 'the horizon');
  inside(growRect(cubicBox(cliff), layout.strokes.cliff / 2), 'the cliff');
  for (const t of [...layout.labels, ...layout.subtitles]) inside(t, `the ${t.domain} text`);
  for (const b of badges(layout)) {
    inside(growRect(b, layout.strokes.item / 2), `a ${b.domain} badge`);
    inside(b.label, `a ${b.domain} badge's label`);
  }
  for (const t of layout.transitions) {
    inside(
      growRect(quadBox(t.start, t.control, t.end), layout.strokes.arrow / 2),
      `${t.ast}'s line`
    );
    inside(pointsBox(t.head), `${t.ast}'s arrowhead`);
    if (t.label) inside(t.label, `${t.ast}'s label`);
  }
  if (layout.title) inside(layout.title, 'the title');
  return out;
}

/**
 * Crowded lists (D617): every quadrant badge lies between its quadrant's top and bottom edges,
 * and no badge meets a badge, a domain label or a subtitle of another domain. A label wider
 * than its quadrant may still cross a side edge, as in v12. Only the rows grow, so this holds
 * on a canvas wide enough for the domains' texts side by side, not on every canvas the config
 * allows: the specs check it at the corpus's own sizes.
 */
export function cynefinCrowdingViolations(layout: CynefinLayout): string[] {
  const out: string[] = [];
  const all = badges(layout);
  for (const b of all) {
    const q = layout.quadrants.find((quadrant) => quadrant.name === b.domain);
    if (q && (b.y < q.y - EPS || b.y + b.height > q.y + q.height + EPS))
      out.push(`a ${b.domain} badge at y ${b.y} leaves its quadrant`);
    const others: readonly (Rect & { readonly domain: CynefinDomainName })[] = [
      ...all,
      ...layout.labels,
      ...layout.subtitles,
    ];
    const hit = others.find((o) => o.domain !== b.domain && rectsOverlap(b, o));
    if (hit) out.push(`a ${b.domain} badge at y ${b.y} meets ${hit.domain}'s text or badge`);
  }
  return out;
}

const badges = (layout: CynefinLayout): CynefinBadge[] =>
  layout.overflow ? [...layout.items, layout.overflow] : [...layout.items];

/** Badges: one per shown item in order, confusion's overflow, each holding its label. */
function itemViolations(model: CynefinModel, layout: CynefinLayout, out: string[]): void {
  const order: readonly CynefinDomainName[] = [
    'complex',
    'complicated',
    'chaotic',
    'clear',
    'confusion',
  ];
  const want: string[] = [];
  let overflow = 0;
  for (const name of order) {
    const items = model.domains.find((d) => d.name === name)?.items ?? [];
    const shown = drawnItems(name, items);
    want.push(...shown.map((i) => i.ast));
    if (name === 'confusion') overflow = items.length - shown.length;
  }
  const got = layout.items.map((i) => i.ast);
  if (got.join('\n') !== want.join('\n')) out.push(`badges ${got.join()} for items ${want.join()}`);
  if ((layout.overflow?.count ?? 0) !== overflow)
    out.push(`an overflow of ${layout.overflow?.count ?? 0} for ${overflow} hidden items`);

  const centers = new Map<CynefinDomainName, Point>(
    layout.quadrants.map((q) => [q.name, q.center])
  );
  centers.set('confusion', layout.confusion.center);
  const all = badges(layout);
  all.forEach((b, i) => {
    if (!contains(b, b.label)) out.push(`a ${b.domain} badge does not hold its label`);
    if (b.height < BADGES.height - EPS) out.push(`a ${b.domain} badge is ${b.height} px tall`);
    const c = centers.get(b.domain)!;
    if (Math.abs(b.x + b.width / 2 - c.x) > EPS) out.push(`a ${b.domain} badge is off its centre`);
    const prev = all[i - 1];
    if (prev && prev.domain === b.domain && b.y < prev.y + prev.height + BADGES.gap - EPS)
      out.push(`two ${b.domain} badges overlap`);
  });
}

/** Transitions: the model's in order, centre to centre, the head's tip past the end. */
function transitionViolations(model: CynefinModel, layout: CynefinLayout, out: string[]): void {
  const want = model.transitions.filter((t) => t.from !== t.to).map((t) => t.ast);
  const got = layout.transitions.map((t) => t.ast);
  if (got.join('\n') !== want.join('\n')) out.push(`transitions ${got.join()} for ${want.join()}`);
  const center = (name: CynefinDomainName): Point =>
    name === 'confusion'
      ? layout.confusion.center
      : layout.quadrants.find((q) => q.name === name)!.center;
  const tip =
    ((ARROWS.markerBox - ARROWS.markerRefX) * ARROWS.markerWidth * layout.strokes.arrow) /
    ARROWS.markerBox;
  for (const t of layout.transitions) {
    if (!near(t.start, center(t.from)) || !near(t.end, center(t.to)))
      out.push(`${t.ast} does not run centre to centre`);
    const d = Math.hypot(t.head[1].x - t.end.x, t.head[1].y - t.end.y);
    // On a huge canvas a pixel is below the coordinates' precision: allow a few units in their last place.
    const slack = Math.max(Math.abs(t.end.x), Math.abs(t.end.y)) * Number.EPSILON * 4;
    if (Math.abs(d - tip) > EPS + slack)
      out.push(`${t.ast}'s arrowhead tip is ${d} px past its end`);
  }
}

const near = (a: Point, b: Point): boolean =>
  Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;

const same = (a: Rect, b: Rect): boolean =>
  near(a, b) && Math.abs(a.width - b.width) <= EPS && Math.abs(a.height - b.height) <= EPS;

/** `outer` holds `inner`, within the tolerance. */
const contains = (outer: Rect, inner: Rect): boolean => rectInside(inner, outer);
