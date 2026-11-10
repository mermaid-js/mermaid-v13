/**
 * The venn layout's invariants (R-LAYOUT-3, spec #429 §Testing): what every layout of every
 * model must satisfy. Empty when they hold; otherwise one line per violation. The conformance
 * sweep runs them over the parser-produced corpus, the layout specs over the edge cases.
 *
 * - no number is NaN or infinite;
 * - circle areas are proportional to the sizes (one px² per unit of size for every set; a
 *   repeated set is one circle, at its last size);
 * - circles are inside the chart's box, `width × (height − titleHeight)`;
 * - text: each text node's cell centre (where its label is centred) is inside its area's inner
 *   circle, each cell is inside the area's grid and the cells do not overlap. Whole cells are
 *   not checked against the inner circle: v12's grid is the `1.9 · r` square about it, so every
 *   cell's corners reach past it. Two of v12's own rules put a cell centre past the circle too,
 *   when the circle is small for the canvas width: the grid's least size (`80s × 60s`) and its
 *   move down (`min(32s, r / 4)`, `30s`); a centre is let past for those only (GAPS #491);
 * - the labels of different areas do not overlap (a repeated area's copies share one place);
 * - everything drawn is inside `bounds`.
 */
import { idsKey, setIdOf, type VennModel } from '../model.ts';
import { circleBox, drawnBoxes, overlaps } from './geometry.ts';
import { VENN_METRICS } from './metrics.ts';
import type { Circle, Rect, VennLayout } from './types.ts';
import { numbers } from '@mermaid-js/core/layout';
import { rectInside as inside } from '@mermaid-js/core/layout';

const EPS = 1e-6;

/** A rectangle as a violation message prints it. */
const printed = (r: Rect): string =>
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
  circlesProportional(model, layout, eps, out);
  textInInnerCircles(layout, eps, out);
  labelsApart(layout, eps, out);
  for (const [what, box] of drawnBoxes(layout)) {
    if (!inside(box, layout.bounds, eps)) {
      out.push(`${what} ${printed(box)} is outside the bounds ${printed(layout.bounds)}`);
    }
  }
  return out;
}

/** One circle per set id, inside the chart, its area proportional to the set's last size. */
function circlesProportional(
  model: VennModel,
  layout: VennLayout,
  eps: number,
  out: string[]
): void {
  const lastSize = new Map<string, number>();
  for (const s of model.subsets) {
    const id = setIdOf(s);
    if (id !== undefined) lastSize.set(id, s.size);
  }
  const chart = { x: 0, y: 0, width: layout.width, height: layout.height - layout.titleHeight };
  let perUnit: number | undefined;
  const seen = new Map<string, Readonly<Circle>>();
  for (const area of layout.areas) {
    if (area.kind !== 'set') continue;
    const id = area.sets[0]!;
    const c = area.circle;
    const before = seen.get(id);
    if (before && (before.x !== c.x || before.y !== c.y || before.radius !== c.radius)) {
      out.push(`the copies of set ${id} have different circles`);
    }
    seen.set(id, c);
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
    const box = circleBox(c);
    if (!inside(box, chart, eps)) {
      out.push(`set ${id}: circle ${printed(box)} is outside the chart ${printed(chart)}`);
    }
  }
}

/**
 * Each text node's cell centre inside its area's inner circle, but where v12's least grid size
 * or the grid's move down puts it out; cells in the grid, apart.
 */
function textInInnerCircles(layout: VennLayout, eps: number, out: string[]): void {
  for (const t of layout.textAreas) {
    const { radius } = t.inner;
    // v12 makes the grid at least 80s × 60s, and moves it down by the label offset.
    const leastSize =
      t.grid.width > VENN_METRICS.textBoxFactor * radius + eps ||
      t.grid.height > VENN_METRICS.textBoxFactor * radius + eps;
    const down = t.grid.y + t.grid.height / 2 - t.inner.y;
    t.nodes.forEach((n, i) => {
      const cx = n.cell.x + n.cell.width / 2;
      const cy = n.cell.y + n.cell.height / 2;
      const d = Math.hypot(cx - t.inner.x, cy - t.inner.y);
      const unmoved = Math.hypot(cx - t.inner.x, cy - down - t.inner.y);
      if (d > radius + eps && !leastSize && unmoved > radius + eps) {
        out.push(
          `text node ${n.id}: its cell centre is ${d.toFixed(2)} from the inner circle's, past its radius ${t.inner.radius.toFixed(2)}`
        );
      }
      if (!inside(n.cell, t.grid, eps)) {
        out.push(
          `text node ${n.id}: cell ${printed(n.cell)} is outside the grid ${printed(t.grid)}`
        );
      }
      for (const other of t.nodes.slice(i + 1)) {
        if (overlaps(n.cell, other.cell, eps)) {
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
      if (idsKey(a.sets) === idsKey(b.sets)) continue;
      if (overlaps(a.label!, b.label!, eps)) {
        out.push(`labels of ${a.sets.join(' ∩ ')} and ${b.sets.join(' ∩ ')} overlap`);
      }
    }
  });
}
