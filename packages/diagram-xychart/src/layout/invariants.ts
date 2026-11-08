/**
 * The XY chart layout's invariants (spec #426 §Testing, R-LAYOUT-3): what every `XyChartLayout`
 * must satisfy for the model it was laid out from. Empty when the layout is sound; each entry
 * names a broken rule. Exported from `@mermaid-js/diagram-xychart/testing` for the conformance
 * corpus spec.
 *
 * - no NaN or Infinity anywhere (D383);
 * - bars inside the plot box, each from the axis (the plot's bottom or left edge) to its value
 *   held inside the box, one per data point with a value;
 * - band centres strictly ordered along the axis, except that a duplicate category shares the
 *   place of its first one;
 * - ticks inside the axis's range;
 * - the legend inside the canvas, or absent;
 * - the title above the plot;
 * - everything drawn inside the bounds (D224).
 */
import type { XyChartModel } from '../model.ts';
import { linearScale } from './scale.ts';
import { textBounds } from './text.ts';
import type { Rect, Segment, XyAxisLayout, XyChartLayout, XyText } from './types.ts';

/** Float tolerance of the checks, in px. */
const EPS = 1e-6;

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

const inBox = (r: Rect, box: Rect): boolean =>
  r.x >= box.x - EPS &&
  r.y >= box.y - EPS &&
  r.x + r.width <= box.x + box.width + EPS &&
  r.y + r.height <= box.y + box.height + EPS;

const near = (a: number, b: number): boolean =>
  Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));

const clampTo = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);

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
      const end = value ? clampTo(value(bar.value), lo, hi) : Number.NaN;
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
  if (title) {
    const t = textBounds(title);
    if (t.y + t.height > plot.y + EPS) out.push('the title is not above the plot');
  }
}

/** Everything drawn inside the bounds. */
function bounds(layout: XyChartLayout, out: string[]): void {
  const inside = (r: Rect, what: string): void => {
    if (!inBox(r, layout.bounds)) out.push(`${what} is outside the bounds`);
  };
  const text = (t: XyText | undefined, what: string): void => {
    if (t) inside(textBounds(t), what);
  };
  const dot = (x: number, y: number, w: number, what: string): void =>
    inside({ x: x - w / 2, y: y - w / 2, width: w, height: w }, what);
  const seg = (s: Segment | undefined, w: number, what: string): void => {
    if (!s) return;
    dot(s.x1, s.y1, w, what);
    dot(s.x2, s.y2, w, what);
  };
  inside({ x: 0, y: 0, width: layout.width, height: layout.height }, 'the canvas');
  inside(layout.plot, 'the plot');
  for (const [name, axis] of [
    ['x', layout.xAxis],
    ['y', layout.yAxis],
  ] as const) {
    seg(axis.line, axis.lineWidth, `the ${name} axis line`);
    for (const t of axis.ticks) {
      seg(t.line, axis.tickWidth, `${name} tick ${String(t.value)}`);
      text(t.label, `${name} label ${String(t.value)}`);
    }
    text(axis.title, `the ${name} axis title`);
  }
  for (const p of layout.plots) {
    if (p.kind === 'bar') {
      for (const bar of p.bars) inside(bar, `plot ${p.index}, bar ${bar.datum}`);
      p.dataLabels.forEach((t, i) => text(t, `plot ${p.index}, data label ${i}`));
    } else {
      for (const pt of p.points)
        dot(pt.x, pt.y, p.strokeWidth, `plot ${p.index}, point ${pt.datum}`);
      p.pointLabels.forEach((t, i) => text(t, `plot ${p.index}, point label ${i}`));
    }
  }
  for (const r of layout.legend?.rows ?? []) {
    if (r.swatch) inside(r.swatch, `legend row ${r.index}`);
    text(r.label, `legend row ${r.index}'s label`);
  }
  text(layout.title, 'the title');
}

/** The value axis's scale, from its domain and range. */
function scaleOf(axis: XyAxisLayout): ((v: number) => number) | undefined {
  return axis.domain ? linearScale(axis.domain, axis.range) : undefined;
}

/** Every number in `v`, at any depth, is finite. */
function finite(v: unknown, path: string, out: string[]): void {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) out.push(`${path} is ${v}`);
  } else if (Array.isArray(v)) v.forEach((x, i) => finite(x, `${path}[${i}]`, out));
  else if (v !== null && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) finite(x, `${path}.${k}`, out);
}
