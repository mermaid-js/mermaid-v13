/**
 * The venn layout's invariants (R-LAYOUT-3, spec #429 §Testing): what every layout of every
 * model must satisfy. Empty when they hold; otherwise one line per violation. The conformance
 * sweep runs them over the parser-produced corpus, the layout specs over the edge cases.
 *
 * - no number is NaN or infinite;
 * - circle areas are proportional to the sizes (one px² per unit of size for every set; a
 *   repeated set is one circle, at its last size);
 * - circles are inside the chart's box, `width × (height − titleHeight)`;
 * - text: each cell is inside its area's grid, the cells do not overlap, each label is centred
 *   on its cell, the grid is centred on the text centre, and the text centre is inside every
 *   circle of its area. v12's grid is the square of side `1.9 · innerRadius` about the inner
 *   circle, so its corner cells reach past that circle; the grid is what is checked;
 * - the labels of different areas do not overlap (a repeated area's copies share one place);
 * - everything drawn is inside `bounds`, and `bounds` holds the canvas.
 */
import type { VennModel } from '../model.ts';
import { areaKey } from './styles.ts';
import type { Point, Rect, VennLayout } from './types.ts';

const EPS = 1e-6;

/** Every number in `value`, with its path. */
function* numbers(value: unknown, path: string): Generator<[string, number]> {
  if (typeof value === 'number') yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* numbers(value[i], `${path}[${i}]`);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) yield* numbers(v, `${path}.${k}`);
  }
}

const inside = (inner: Rect, outer: Rect, eps: number): boolean =>
  inner.x >= outer.x - eps &&
  inner.y >= outer.y - eps &&
  inner.x + inner.width <= outer.x + outer.width + eps &&
  inner.y + inner.height <= outer.y + outer.height + eps;

const overlap = (a: Rect, b: Rect, eps: number): boolean =>
  a.x < b.x + b.width - eps &&
  b.x < a.x + a.width - eps &&
  a.y < b.y + b.height - eps &&
  b.y < a.y + a.height - eps;

const disc = (c: Point, r: number): Rect => ({
  x: c.x - r,
  y: c.y - r,
  width: 2 * r,
  height: 2 * r,
});
const shown = (r: Rect): string =>
  `(${r.x.toFixed(2)}, ${r.y.toFixed(2)}, ${r.width.toFixed(2)} × ${r.height.toFixed(2)})`;

/** The violations of `layout`, laid out from `model`. */
export function vennLayoutViolations(model: VennModel, layout: VennLayout): string[] {
  const out: string[] = [];
  for (const [path, n] of numbers(layout, 'layout')) {
    if (!Number.isFinite(n)) out.push(`${path} is ${n}`);
  }
  if (out.length > 0) return out;
  // Lengths are compared to the canvas: the tolerance scales with it.
  const eps = EPS * Math.max(1, layout.width, layout.height);
  const circles = circlesOf(model, layout, eps, out);
  textInGrids(layout, circles, eps, out);
  labelsApart(layout, eps, out);
  inBounds(layout, eps, out);
  return out;
}

interface DrawnCircle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * Each set's circle, checked: one per set id, inside the chart, its area proportional to the
 * set's last size.
 */
function circlesOf(
  model: VennModel,
  layout: VennLayout,
  eps: number,
  out: string[]
): Map<string, DrawnCircle> {
  const lastSize = new Map<string, number>();
  for (const s of model.subsets) if (s.sets.length === 1) lastSize.set(s.sets[0]!, s.size);
  const chart = { x: 0, y: 0, width: layout.width, height: layout.height - layout.titleHeight };
  let perUnit: number | undefined;
  const circleOf = new Map<string, DrawnCircle>();
  for (const area of layout.areas) {
    if (area.kind !== 'set') continue;
    const id = area.sets[0]!;
    const c = area.circle;
    if (!c) {
      out.push(`set ${id} has no circle`);
      continue;
    }
    const seen = circleOf.get(id);
    if (seen && (seen.x !== c.center.x || seen.y !== c.center.y || seen.r !== c.radius)) {
      out.push(`the copies of set ${id} have different circles`);
    }
    circleOf.set(id, { x: c.center.x, y: c.center.y, r: c.radius });
    const size = lastSize.get(id);
    if (size === undefined || !(size > 0)) {
      out.push(`set ${id} is drawn with size ${String(size)}`);
      continue;
    }
    const k = (Math.PI * c.radius * c.radius) / size;
    perUnit ??= k;
    if (Math.abs(k - perUnit) > EPS * perUnit) {
      out.push(`set ${id}: area per unit of size ${k} is not ${perUnit}`);
    }
    const d = disc(c.center, c.radius);
    if (!inside(d, chart, eps)) {
      out.push(`set ${id}: circle ${shown(d)} is outside the chart ${shown(chart)}`);
    }
  }
  return circleOf;
}

/** Text nodes in their area's grid, the grid on the area's centre, the centre in the area. */
function textInGrids(
  layout: VennLayout,
  circles: ReadonlyMap<string, DrawnCircle>,
  eps: number,
  out: string[]
): void {
  for (const t of layout.textAreas) {
    const name = t.sets.join(' ∩ ');
    if (Math.abs(t.grid.x + t.grid.width / 2 - t.centre.x) > eps) {
      out.push(`text area ${name}: the grid is not centred on the text centre`);
    }
    for (const id of t.sets) {
      const c = circles.get(id);
      if (c && Math.hypot(t.centre.x - c.x, t.centre.y - c.y) > c.r + eps) {
        out.push(`text area ${name}: the text centre is outside set ${id}`);
      }
    }
    t.nodes.forEach((n, i) => {
      if (!inside(n.cell, t.grid, eps)) {
        out.push(`text node ${n.id}: cell ${shown(n.cell)} is outside the grid ${shown(t.grid)}`);
      }
      const dx = n.cell.x + n.cell.width / 2 - (n.label.x + n.label.width / 2);
      const dy = n.cell.y + n.cell.height / 2 - (n.label.y + n.label.height / 2);
      if (Math.abs(dx) > eps || Math.abs(dy) > eps) {
        out.push(`text node ${n.id}: the label is not centred on its cell`);
      }
      for (const other of t.nodes.slice(i + 1)) {
        if (overlap(n.cell, other.cell, eps)) {
          out.push(`text nodes ${n.id} and ${other.id}: the cells overlap`);
        }
      }
    });
  }
}

/** Labels of different areas never on top of one another. */
function labelsApart(layout: VennLayout, eps: number, out: string[]): void {
  const labelled = layout.areas.filter((a) => a.label);
  labelled.forEach((a, i) => {
    for (const b of labelled.slice(i + 1)) {
      if (areaKey(a.sets) === areaKey(b.sets)) continue;
      if (overlap(a.label!, b.label!, eps)) {
        out.push(`labels of ${a.sets.join(' ∩ ')} and ${b.sets.join(' ∩ ')} overlap`);
      }
    }
  });
}

/** Everything drawn inside the bounding box, and the canvas too. */
function inBounds(layout: VennLayout, eps: number, out: string[]): void {
  const { bounds, offset } = layout;
  const moved = (r: Rect): Rect => ({ ...r, x: r.x + offset.x, y: r.y + offset.y });
  const within = (what: string, r: Rect): void => {
    if (!inside(r, bounds, eps)) {
      out.push(`${what} ${shown(r)} is outside the bounds ${shown(bounds)}`);
    }
  };
  within('the canvas', { x: 0, y: 0, width: layout.width, height: layout.height });
  if (layout.title) within('the title', layout.title);
  for (const area of layout.areas) {
    const name = area.sets.join(' ∩ ');
    if (area.circle) {
      const r = area.circle.radius + area.circle.strokeWidth / 2;
      within(`set ${name}'s circle`, moved(disc(area.circle.center, r)));
    }
    if (area.label) within(`${name}'s label`, moved(area.label));
  }
  for (const t of layout.textAreas) {
    for (const n of t.nodes) within(`text node ${n.id}'s label`, moved(n.label));
  }
  if (layout.debug) {
    const stroke = layout.debug.circleStroke / 2;
    for (const c of layout.debug.circles) {
      within('a debug circle', moved(disc(c.center, c.radius + stroke)));
    }
  }
}
