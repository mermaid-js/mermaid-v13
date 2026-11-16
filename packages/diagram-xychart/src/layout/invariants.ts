/**
 * The XY chart layout's invariants (spec #426 §Testing, R-LAYOUT-3): what every `XyChartLayout`
 * must satisfy for the model it was laid out from. Empty when the layout is sound; each entry
 * names a broken rule. Exported from `@mermaid-js/diagram-xychart/testing` for the conformance
 * corpus spec.
 *
 * - no NaN or Infinity anywhere, in numbers, paths and number texts (D383);
 * - bars inside the plot box, each from the axis (the plot's bottom or left edge) to its value
 *   held inside the box, one per data point with a value;
 * - band centres strictly ordered along the axis, except that a duplicate category shares the
 *   place of its first one;
 * - ticks inside the axis's range;
 * - the legend inside the canvas, or absent, its row labels not overlapping (D385);
 * - the title above the plot;
 * - everything drawn inside the bounds (D224).
 */
import type { XyChartModel } from '../model.ts';
import { linearScale } from './scale.ts';
import { textBounds } from './text.ts';
import type { Rect, XyAxisLayout, XyChartLayout } from './types.ts';
import { clamp, visitDrawn } from './walk.ts';
import { EPS, rectInside as inBox } from '@mermaid-js/shared/testing/layout-invariants';

export function xyChartLayoutViolations(model: XyChartModel, layout: XyChartLayout): string[] {
  const out: string[] = [];
  finite(layout, 'layout', out);
  plots(model, layout, out);
  band(layout.xAxis, out);
  ticks(layout, out);
  frame(layout, out);
  bounds(layout, out);
  return out;
}

const near = (a: number, b: number): boolean =>
  Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

/** One drawn mark per value; bars inside the plot, from the axis to the value. */
function plots(model: XyChartModel, layout: XyChartLayout, out: string[]): void {
  const { plot } = layout;
  const horizontal = layout.orientation === 'horizontal';
  if (layout.plots.length !== model.plots.length)
    out.push(`${layout.plots.length} plots for ${model.plots.length}`);
  const value = scaleOf(layout.yAxis);
  const [lo, hi] = horizontal ? [plot.x, plot.x + plot.width] : [plot.y, plot.y + plot.height];
  for (const p of layout.plots) {
    const src = model.plots[p.index];
    if (src?.kind !== p.kind) {
      out.push(`plot ${p.index} is not the model's ${p.kind} plot`);
      continue;
    }
    const want = src.data.filter((d) => d.y !== undefined).length;
    const drawn = p.kind === 'bar' ? p.bars.length : p.points.length;
    if (drawn !== want) out.push(`plot ${p.index} draws ${drawn} of ${want} values`);
    if (p.kind !== 'bar') continue;
    for (const bar of p.bars) {
      const name = `plot ${p.index}, bar ${bar.datum}`;
      if (bar.width < -EPS || bar.height < -EPS) out.push(`${name} has a negative size`);
      if (!inBox(bar, plot)) out.push(`${name} is outside the plot box`);
      const end = value ? clamp(value(bar.value), lo, hi) : Number.NaN;
      const ok = horizontal
        ? near(bar.x, plot.x) && near(bar.x + bar.width, end)
        : near(bar.y + bar.height, plot.y + plot.height) && near(bar.y, end);
      if (!ok) out.push(`${name} does not run from the axis to its value`);
    }
  }
}

/** Band centres strictly ordered, duplicates at their first one's place. */
function band(x: XyAxisLayout, out: string[]): void {
  if (x.kind !== 'band') return;
  const first = new Map<string, number>();
  let last = -Infinity;
  for (const t of x.ticks) {
    const c = String(t.value);
    const seen = first.get(c);
    if (seen !== undefined) {
      if (!near(seen, t.at)) out.push(`duplicate category ${c} is not at its first place`);
      continue;
    }
    first.set(c, t.at);
    if (!(t.at > last)) out.push(`band centre of ${c} is not after the one before`);
    last = t.at;
  }
}

/** Ticks inside the axis range. */
function ticks(layout: XyChartLayout, out: string[]): void {
  for (const [name, axis] of [
    ['x', layout.xAxis],
    ['y', layout.yAxis],
  ] as const) {
    const [a, b] = axis.range;
    for (const t of axis.ticks)
      if (t.at < Math.min(a, b) - EPS || t.at > Math.max(a, b) + EPS)
        out.push(`${name} tick ${String(t.value)} at ${t.at} is outside [${a}, ${b}]`);
  }
}

/** The legend inside the canvas or absent; the title above the plot. */
function frame(layout: XyChartLayout, out: string[]): void {
  const canvas: Rect = { x: 0, y: 0, width: layout.width, height: layout.height };
  const { legend, title, plot } = layout;
  if (legend && !inBox(legend.box, canvas)) out.push('the legend is outside the canvas');
  if (legend?.rows.length === 0) out.push('the legend has no rows');
  legend?.rows.forEach((r, i) => {
    const next = legend.rows[i + 1];
    if (next && r.label.box.y + r.label.box.height > next.label.box.y + EPS)
      out.push(`legend row ${r.index}'s label overlaps the next row's`);
  });
  if (title) {
    const t = textBounds(title);
    if (t.y + t.height > plot.y + EPS) out.push('the title is not above the plot');
  }
}

/** Everything drawn inside the bounds (the walk `layoutXyChart`'s bounds take). */
function bounds(layout: XyChartLayout, out: string[]): void {
  const inside = (r: Rect, what: string): void => {
    if (!inBox(r, layout.bounds)) out.push(`${what} is outside the bounds`);
  };
  inside({ x: 0, y: 0, width: layout.width, height: layout.height }, 'the canvas');
  inside(layout.plot, 'the plot');
  visitDrawn(layout, {
    box: inside,
    dot: (p, w, what) => inside({ x: p.x - w / 2, y: p.y - w / 2, width: w, height: w }, what),
  });
}

/** The value axis's scale, from its domain and range. */
function scaleOf(axis: XyAxisLayout): ((v: number) => number) | undefined {
  return axis.domain ? linearScale(axis.domain, axis.range) : undefined;
}

const NOT_FINITE = /NaN|Infinity/;

/**
 * Every number in `v`, at any depth, is finite, and so is every number written as text: a line's
 * `path`, and a plain text (a tick number, a data label: an `XyText` without a `label`). Author
 * text (a category named `NaN`) is not checked.
 */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object') {
    const node = v as Record<string, unknown>;
    const written = typeof node.path === 'string' ? node.path : plainText(node);
    if (written !== undefined && NOT_FINITE.test(written)) out.push(`${path} writes ${written}`);
    for (const [k, x] of Object.entries(node)) finite(x, `${path}.${k}`, out);
  }
}

/** A plain `XyText`'s text: one with an anchor and a font but no `label`. */
function plainText(node: Record<string, unknown>): string | undefined {
  return typeof node.text === 'string' && 'anchor' in node && 'font' in node && !('label' in node)
    ? node.text
    : undefined;
}
